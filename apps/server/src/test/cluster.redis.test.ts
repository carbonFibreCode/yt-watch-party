import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomView } from '@watchparty/shared';
import { createRedisBackplane } from '../infrastructure/backplane';
import { createMemoryPersistence } from '../infrastructure/persistence';
import { RedisRoomRepository } from '../infrastructure/repositories/RedisRoomRepository';
import { connectTestRedis } from './redis/testRedis';
import type { TestRedis } from './redis/testRedis';
import { call, next, record, settle, startServer } from './server';
import type { Client, TestServer } from './server';

/**
 * Two real instances sharing one Redis, as in production with REDIS_URL (LLD SP-19): room state
 * through the Lua-CAS store, fan-out and cluster-wide socket operations through the adapter.
 */
let t: TestRedis;
let a: TestServer;
let b: TestServer;

const instance = (): Promise<TestServer> =>
  startServer({
    persistence: {
      ...createMemoryPersistence(),
      rooms: new RedisRoomRepository(t.redis, `${t.prefix}room:`),
    },
    backplane: createRedisBackplane(t.redis, t.prefix),
  });

beforeEach(async () => {
  t = await connectTestRedis();
  a = await instance();
  b = await instance();
});

afterEach(async () => {
  await a.close();
  await b.close();
  await t.close();
});

const join = async (socket: Client, roomId: string): Promise<RoomView> => {
  const ack = await call(socket, 'join_room', { roomId });
  if (!ack.ok) {
    throw new Error(`join failed: ${ack.error.code}`);
  }
  return ack.data.room;
};

/** Host on instance A; Pat and Bo on instance B. */
const party = async () => {
  const { id } = await a.app.rooms.create('Cluster night', { userId: 'u-host', name: 'Hana' });
  const host = await a.connect('u-host:Hana');
  await join(host, id);
  const patJoined = next(host, 'user_joined');
  const pat = await b.connect('u-pat:Pat');
  const view = await join(pat, id);
  const bo = await b.connect('u-bo:Bo');
  await join(bo, id);
  return { id, host, pat, bo, view, patJoined };
};

describe('two instances, one Redis', () => {
  it('shares room state and fans events out across instances', async () => {
    const { host, pat, view, patJoined } = await party();
    expect(view.participants.map((p) => p.userId)).toEqual(['u-host', 'u-pat']);
    expect(await patJoined).toMatchObject({ userId: 'u-pat' });

    // Through the adapter even local delivery follows the stream write, so a broadcast can land
    // after the ack; wait for both copies before the next step (clients order states by rev).
    const synced = [next(pat, 'sync_state'), next(host, 'sync_state')];
    expect(await call(host, 'change_video', { url: 'https://youtu.be/dQw4w9WgXcQ' })).toMatchObject({
      ok: true,
    });
    for (const state of await Promise.all(synced)) {
      expect(state).toMatchObject({ videoId: 'dQw4w9WgXcQ', playState: 'playing' });
    }

    const paused = next(host, 'sync_state');
    expect(await call(pat, 'request_action', { action: { type: 'pause' } })).toMatchObject({ ok: true });
    const asked = await next(host, 'action_requested');
    expect(await call(host, 'resolve_request', { requestId: asked.id, approve: true })).toMatchObject({
      ok: true,
    });
    expect(await paused).toMatchObject({ playState: 'paused' });
  });

  it('kicks a user connected to another instance', async () => {
    const { id, host, pat, bo } = await party();
    const kicked = next(pat, 'kicked');
    expect(await call(host, 'remove_participant', { userId: 'u-pat' })).toMatchObject({ ok: true });
    expect(await kicked).toEqual({ roomId: id, reason: 'removed_by_host' });

    // Pat's socket on B left the room channel: Bo (also on B) gets the next message, Pat does not.
    const patChat = record(pat, 'chat_message');
    const boChat = next(bo, 'chat_message');
    await call(host, 'chat_message', { text: 'bye Pat' });
    expect(await boChat).toMatchObject({ text: 'bye Pat' });
    expect(patChat).toEqual([]);
    expect(await call(pat, 'chat_message', { text: 'wait' })).toMatchObject({
      error: { code: 'NOT_IN_ROOM' },
    });
    expect(await call(pat, 'join_room', { roomId: id })).toMatchObject({ error: { code: 'BANNED' } });
  });

  it("counts a user's tabs on every instance before marking them away", async () => {
    const { id, host } = await party();
    const tabOnA = await a.connect('u-pat:Pat');
    await join(tabOnA, id);
    const presence = record(host, 'presence_changed');

    // Pat closes the tabs on B; the tab on A keeps Pat online.
    for (const socket of await b.app.io.in(`room:${id}:user:u-pat`).local.fetchSockets()) {
      socket.disconnect(true);
    }
    await vi.waitFor(() => {
      expect(b.scheduler.tasks.size + a.scheduler.tasks.size).toBe(0);
    });
    await settle(host);
    expect(presence).toEqual([]);

    const away = next(host, 'presence_changed');
    tabOnA.disconnect();
    expect(await away).toMatchObject({ userId: 'u-pat', presence: 'away' });
  });
});
