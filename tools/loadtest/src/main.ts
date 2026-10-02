import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { call, connect, createRoom, signInGuest } from './client';
import type { WatchSocket } from './client';
import { pool, summarize, tally } from './stats';
import type { Summary } from './stats';

/**
 * Load test (LLD SP-19 §7): R rooms × U users as real guests over HTTP + WebSocket. One controller
 * per room seeks every `seek-every` ms; every member records the fan-out latency of each
 * `sync_state` as receivedAt − serverTime (the server's publish time). Run it on the same machine
 * as the servers so both clocks agree.
 *
 *   pnpm --filter @watchparty/loadtest start --url http://localhost:8080 --rooms 20 --users 50
 */
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8080' },
    rooms: { type: 'string', default: '20' },
    users: { type: 'string', default: '50' },
    duration: { type: 'string', default: '60' },
    'seek-every': { type: 'string', default: '2000' },
    concurrency: { type: 'string', default: '50' },
    video: { type: 'string', default: 'https://youtu.be/dQw4w9WgXcQ' },
    json: { type: 'string' },
  },
});

const url = args.url;
const rooms = Number(args.rooms);
const usersPerRoom = Number(args.users);
const durationMs = Number(args.duration) * 1000;
const seekEveryMs = Number(args['seek-every']);
const concurrency = Number(args.concurrency);
const DRAIN_MS = 3_000;
const MAX_SEEK_S = 180;

interface Member {
  readonly room: number;
  readonly socket: WatchSocket;
}

const log = (message: string): void => {
  process.stdout.write(`${new Date().toISOString().slice(11, 19)} ${message}\n`);
};

const timed = async <T>(task: () => Promise<T>): Promise<{ value: T; ms: number }> => {
  const started = performance.now();
  const value = await task();
  return { value, ms: performance.now() - started };
};

const errors: Record<string, number> = {};
const fail = (stage: string) => (error: unknown) => {
  tally(errors, `${stage}: ${error instanceof Error ? error.message.slice(0, 80) : String(error)}`);
  return null;
};

// 1. Guests sign in over HTTP, exactly like the web app.
const total = rooms * usersPerRoom;
log(`signing in ${String(total)} guests (${String(rooms)} rooms × ${String(usersPerRoom)})`);
const signIns = await timed(() =>
  pool(
    Array.from({ length: total }, (_, i) => i),
    concurrency,
    (i) => signInGuest(url, `load-${String(i)}`).catch(fail('sign-in')),
  ),
);
const cookies = signIns.value;

// 2. The first guest of each room creates it and is its host (the controller).
const roomIds = await pool(
  Array.from({ length: rooms }, (_, r) => r),
  concurrency,
  async (r) => {
    const cookie = cookies[r * usersPerRoom];
    return cookie === null || cookie === undefined
      ? null
      : createRoom(url, cookie, `Load room ${String(r)}`, args.video).catch(fail('create-room'));
  },
);

// 3. Everyone connects and joins; measure the join storm.
log('connecting and joining');
const joinMs: number[] = [];
const members = (
  await pool(cookies, concurrency, async (cookie, i): Promise<Member | null> => {
    const room = Math.floor(i / usersPerRoom);
    const roomId = roomIds[room];
    if (cookie === null || roomId === null || roomId === undefined) {
      return null;
    }
    const socket = await connect(url, cookie).catch(fail('connect'));
    if (socket === null) {
      return null;
    }
    const joined = await timed(() => call(socket, 'join_room', { roomId }));
    if (!joined.value.ok) {
      tally(errors, `join: ${joined.value.error.code}`);
      socket.disconnect();
      return null;
    }
    joinMs.push(joined.ms);
    return { room, socket };
  })
).filter((m): m is Member => m !== null);
const roomSize = Array.from({ length: rooms }, (_, r) => members.filter((m) => m.room === r).length);
log(`${String(members.length)}/${String(total)} members joined`);

// 4. Measure: controllers seek; everyone records fan-out latency of each sync_state.
const fanOutMs: number[] = [];
const received = new Array<number>(rooms).fill(0);
const ackMs: number[] = [];
let measuring = true;
let expected = 0;
for (const member of members) {
  member.socket.on('sync_state', (state) => {
    if (measuring) {
      fanOutMs.push(Date.now() - state.serverTime);
      received[member.room] = (received[member.room] ?? 0) + 1;
    }
  });
  member.socket.on('disconnect', (reason) => {
    if (measuring) {
      tally(errors, `disconnect: ${reason}`);
    }
  });
}
const controllers = Array.from({ length: rooms }, (_, r) => members.find((m) => m.room === r)).filter(
  (m): m is Member => m !== undefined,
);
log(
  `measuring for ${String(durationMs / 1000)}s: ${String(controllers.length)} controllers seek every ${String(seekEveryMs)}ms`,
);
const timers = controllers.map((controller, i) => {
  const seek = (): void => {
    void timed(() => call(controller.socket, 'seek', { time: Math.round(Math.random() * MAX_SEEK_S) })).then(
      ({ value, ms }) => {
        if (value.ok) {
          ackMs.push(ms);
          expected += roomSize[controller.room] ?? 0;
        } else {
          tally(errors, `seek: ${value.error.code}`);
        }
      },
      fail('seek'),
    );
  };
  // Stagger rooms so seeks are spread over the interval rather than synchronized.
  const start = setTimeout(
    () => {
      seek();
      timers[i] = setInterval(seek, seekEveryMs);
    },
    (seekEveryMs / controllers.length) * i,
  );
  return start;
});
await new Promise((resolve) => setTimeout(resolve, durationMs));
for (const timer of timers) {
  clearTimeout(timer);
  clearInterval(timer);
}
await new Promise((resolve) => setTimeout(resolve, DRAIN_MS));
measuring = false;
for (const member of members) {
  member.socket.disconnect();
}

// 5. Report.
const deliveries = received.reduce((a, b) => a + b, 0);
const fmt = (s: Summary): string =>
  `p50 ${s.p50.toFixed(0)} · p95 ${s.p95.toFixed(0)} · p99 ${s.p99.toFixed(0)} · max ${s.max.toFixed(0)} ms (n=${String(s.count)})`;
const report = {
  url,
  rooms,
  usersPerRoom,
  durationS: durationMs / 1000,
  seekEveryMs,
  signInS: Number((signIns.ms / 1000).toFixed(1)),
  joined: members.length,
  join: summarize(joinMs),
  seekAck: summarize(ackMs),
  fanOut: summarize(fanOutMs),
  deliveries: { expected, received: deliveries, ratio: expected === 0 ? 0 : deliveries / expected },
  errors,
};
log('done');
process.stdout.write(
  [
    '',
    `users joined     ${String(report.joined)}/${String(total)} (sign-in of all guests took ${String(report.signInS)}s)`,
    `join ack         ${fmt(report.join)}`,
    `seek ack         ${fmt(report.seekAck)}`,
    `fan-out latency  ${fmt(report.fanOut)}`,
    `deliveries       ${String(deliveries)}/${String(expected)} (${(report.deliveries.ratio * 100).toFixed(2)}%)`,
    `errors           ${Object.keys(errors).length === 0 ? 'none' : JSON.stringify(errors)}`,
    '',
  ].join('\n'),
);
if (args.json !== undefined) {
  writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
}
process.exit(0);
