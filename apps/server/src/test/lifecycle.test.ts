import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GRACE_PERIOD_MS, MAX_HTTP_BUFFER_BYTES, RATE_LIMITS, REQUEST_TTL_MS } from '@watchparty/shared';
import { call, next, settle, startServer } from './server';
import type { Client, TestServer } from './server';

/** LLD SP-9 / SP-17 edge cases over real sockets, with deterministic time and timers. */
let server: TestServer;

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  await server.close();
});

const join = async (socket: Client, roomId: string): Promise<void> => {
  const ack = await call(socket, 'join_room', { roomId });
  if (!ack.ok) {
    throw new Error(ack.error.code);
  }
};

const party = async () => {
  const roomId = (await server.app.rooms.create('Chaos', { userId: 'u-host', name: 'Hana' })).id;
  const host = await server.connect('u-host:Hana');
  const mod = await server.connect('u-mod:Mo');
  const part = await server.connect('u-part:Pat');
  for (const socket of [host, mod, part]) {
    await join(socket, roomId);
  }
  await call(host, 'assign_role', { userId: 'u-mod', role: 'moderator' });
  await settle(part);
  return { roomId, host, mod, part };
};

describe('presence lifecycle', () => {
  it('hands host to the moderator when the host does not come back in time', async () => {
    const { mod, host } = await party();
    const away = next(mod, 'presence_changed');
    host.disconnect();
    await away;
    const transferred = next(mod, 'host_transferred');
    server.clock.advance(GRACE_PERIOD_MS);
    await server.scheduler.runAll();
    expect(await transferred).toMatchObject({
      fromUserId: 'u-host',
      toUserId: 'u-mod',
      reason: 'succession',
    });
  });

  it('still removes an expired member when no timer ever fires (lazy reaping)', async () => {
    const { roomId, mod, part } = await party();
    const away = next(mod, 'presence_changed');
    part.disconnect();
    await away;
    server.scheduler.cancelAll();
    server.clock.advance(GRACE_PERIOD_MS + 1);
    const left = next(mod, 'user_left');
    await call(mod, 'pause', {});
    expect(await left).toMatchObject({ userId: 'u-part', reason: 'timeout' });
    expect((await server.app.rooms.read(roomId)).participant('u-part')).toBeUndefined();
  });

  it('remembers a moderator’s role when they leave and come back', async () => {
    const { roomId, mod } = await party();
    await call(mod, 'leave_room', { roomId });
    const again = await server.connect('u-mod:Mo');
    const ack = await call(again, 'join_room', { roomId });
    expect(ack).toMatchObject({ ok: true, data: { room: { self: { role: 'moderator' } } } });
  });
});

describe('approval deadlines', () => {
  it('tells the requester and staff when a request expires, on time', async () => {
    const { host, part } = await party();
    const ack = await call(part, 'request_action', { action: { type: 'pause' } });
    if (!ack.ok) {
      throw new Error(ack.error.code);
    }
    const toRequester = next(part, 'request_resolved');
    const toStaff = next(host, 'request_resolved');
    server.clock.advance(REQUEST_TTL_MS);
    await server.scheduler.runAll();
    const expected = { requestId: ack.data.requestId, status: 'expired' };
    expect(await toRequester).toEqual(expected);
    expect(await toStaff).toEqual(expected);
  });
});

describe('abuse limits over the wire', () => {
  it('rate limits a flood of playback commands', async () => {
    const { host } = await party();
    const results = [];
    for (let i = 0; i <= RATE_LIMITS.playback.points; i += 1) {
      results.push(await call(host, 'seek', { time: i }));
    }
    expect(results.slice(0, -1).every((r) => r.ok)).toBe(true);
    expect(results.at(-1)).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('drops a connection that sends an oversized message', async () => {
    const { host } = await party();
    const closed = new Promise<string>((resolve) => {
      host.once('disconnect', resolve);
    });
    host.emit('chat_message', { text: 'x'.repeat(MAX_HTTP_BUFFER_BYTES * 2) }, () => undefined);
    expect(await closed).toBe('transport close');
  });
});
