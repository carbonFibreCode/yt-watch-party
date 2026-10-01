import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GRACE_PERIOD_MS } from '@watchparty/shared';
import type { RoomView } from '@watchparty/shared';
import { call, next, record, settle, startServer } from './server';
import type { Client, TestServer } from './server';

let server: TestServer;

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  await server.close();
});

const roomId = async (): Promise<string> =>
  (await server.app.rooms.create('Movie night', { userId: 'u-host', name: 'Hana' })).id;

const join = async (socket: Client, id: string): Promise<RoomView> => {
  const ack = await call(socket, 'join_room', { roomId: id });
  if (!ack.ok) {
    throw new Error(`join failed: ${ack.error.code}`);
  }
  return ack.data.room;
};

/** Host, moderator and participant connected and joined; roles assigned through real commands. */
const party = async () => {
  const id = await roomId();
  const host = await server.connect('u-host:Hana');
  const mod = await server.connect('u-mod:Mo');
  const part = await server.connect('u-part:Pat');
  await join(host, id);
  await join(mod, id);
  await join(part, id);
  await call(host, 'assign_role', { userId: 'u-mod', role: 'moderator' });
  await settle(part);
  return { id, host, mod, part };
};

describe('socket gateway', () => {
  it('rejects connections without a session', async () => {
    await expect(server.connect(null)).rejects.toThrow('UNAUTHENTICATED');
  });

  it('rejects connections from a foreign origin', async () => {
    await expect(server.connect('u1:A', { origin: 'https://evil.example' })).rejects.toThrow();
  });

  it('acks unknown events as malformed and ignores events without an ack', async () => {
    const socket = await server.connect('u1:A');
    expect(
      await (call as (s: Client, e: string, p: unknown) => Promise<unknown>)(socket, 'drop_tables', {}),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    (socket as unknown as { emit: (e: string, p: unknown) => void }).emit('play', {});
    expect(await call(socket, 'timesync', { jsonrpc: '2.0', id: 1, method: 'timesync' })).toEqual({
      ok: true,
      data: { jsonrpc: '2.0', id: 1, result: server.clock.now() },
    });
  });
});

describe('rooms over real sockets', () => {
  it('joins with the full room view and announces newcomers to everyone else', async () => {
    const id = await roomId();
    const host = await server.connect('u-host:Hana');
    const view = await join(host, id);
    expect(view).toMatchObject({ id, hostId: 'u-host', self: { role: 'host', presence: 'online' } });

    const joined = next(host, 'user_joined');
    const guest = await server.connect('u-guest:Gus');
    await join(guest, id);
    expect(await joined).toMatchObject({
      userId: 'u-guest',
      username: 'Gus',
      role: 'participant',
      participants: [{ userId: 'u-host' }, { userId: 'u-guest' }],
    });
  });

  it('enforces roles and syncs playback to everyone', async () => {
    const { host, mod, part } = await party();
    expect(await call(part, 'change_video', { url: 'https://youtu.be/dQw4w9WgXcQ' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });

    const states = [next(host, 'sync_state'), next(mod, 'sync_state'), next(part, 'sync_state')];
    expect(await call(mod, 'change_video', { url: 'https://youtu.be/dQw4w9WgXcQ?t=30' })).toEqual({
      ok: true,
      data: {},
    });
    for (const state of await Promise.all(states)) {
      expect(state).toMatchObject({ videoId: 'dQw4w9WgXcQ', playState: 'playing', currentTime: 30, rev: 1 });
    }

    const seeks = [next(host, 'sync_state'), next(part, 'sync_state')];
    await call(mod, 'seek', { time: 95 });
    expect(await Promise.all(seeks)).toMatchObject([
      { currentTime: 95, rev: 2 },
      { currentTime: 95, rev: 2 },
    ]);
  });

  it('broadcasts role changes and routes requests to staff only', async () => {
    const { host, mod, part } = await party();
    const partRequests = record(part, 'action_requested');

    const roleChange = next(part, 'role_assigned');
    await call(host, 'assign_role', { userId: 'u-part', role: 'viewer' });
    expect(await roleChange).toMatchObject({ userId: 'u-part', role: 'viewer' });
    await call(host, 'assign_role', { userId: 'u-part', role: 'participant' });
    await call(mod, 'change_video', { url: 'https://youtu.be/dQw4w9WgXcQ' });

    const toHost = next(host, 'action_requested');
    const toMod = next(mod, 'action_requested');
    const ack = await call(part, 'request_action', { action: { type: 'seek', time: 42 } });
    if (!ack.ok) {
      throw new Error(ack.error.code);
    }
    expect(await toHost).toMatchObject({
      id: ack.data.requestId,
      requester: { userId: 'u-part' },
      action: { type: 'seek', time: 42 },
    });
    await toMod;

    const resolved = next(part, 'request_resolved');
    const synced = next(part, 'sync_state');
    await call(mod, 'resolve_request', { requestId: ack.data.requestId, approve: true });
    expect(await resolved).toEqual({
      requestId: ack.data.requestId,
      status: 'approved',
      resolvedBy: 'u-mod',
    });
    expect(await synced).toMatchObject({ currentTime: 42 });
    expect(partRequests).toEqual([]);
  });

  it('replays pending requests to a newly promoted moderator', async () => {
    const { id, host, part } = await party();
    const late = await server.connect('u-late:Lou');
    await join(late, id);
    await call(part, 'request_action', { action: { type: 'pause' } });
    const replay = next(late, 'action_requested');
    await call(host, 'assign_role', { userId: 'u-late', role: 'moderator' });
    expect(await replay).toMatchObject({ requester: { userId: 'u-part' }, action: { type: 'pause' } });
  });

  it('kicks a removed participant: notified, cut off, and banned', async () => {
    const { id, host, mod, part } = await party();
    const kicked = next(part, 'kicked');
    const removed = next(host, 'participant_removed');
    expect(await call(mod, 'remove_participant', { userId: 'u-part' })).toMatchObject({ ok: true });
    expect(await kicked).toEqual({ roomId: id, reason: 'removed_by_moderator' });
    expect(await removed).toMatchObject({
      userId: 'u-part',
      participants: [{ userId: 'u-host' }, { userId: 'u-mod' }],
    });

    const partChat = record(part, 'chat_message');
    await call(host, 'chat_message', { text: 'bye' });
    await settle(part);
    expect(partChat).toEqual([]);
    expect(await call(part, 'chat_message', { text: 'wait' })).toMatchObject({
      error: { code: 'NOT_IN_ROOM' },
    });
    expect(await call(part, 'join_room', { roomId: id })).toMatchObject({ error: { code: 'BANNED' } });
  });

  it('delivers chat and reactions to the room', async () => {
    const { host, part } = await party();
    const chat = next(host, 'chat_message');
    const reaction = next(host, 'reaction');
    await call(part, 'chat_message', { text: 'hello' });
    await call(part, 'reaction', { emoji: '🔥', videoTime: 12 });
    expect(await chat).toMatchObject({ user: { userId: 'u-part', role: 'participant' }, text: 'hello' });
    expect(await reaction).toMatchObject({ userId: 'u-part', emoji: '🔥', videoTime: 12 });
  });

  it('includes chat history when joining', async () => {
    const { id, part } = await party();
    await call(part, 'chat_message', { text: 'first!' });
    const late = await server.connect('u-late:Lou');
    const ack = await call(late, 'join_room', { roomId: id });
    expect(ack).toMatchObject({ ok: true, data: { chatHistory: [{ text: 'first!' }] } });
  });
});

describe('presence lifecycle over real sockets', () => {
  it('treats a second tab as the same member', async () => {
    const { id, host } = await party();
    const joins = record(host, 'user_joined');
    const presence = record(host, 'presence_changed');
    const secondTab = await server.connect('u-part:Pat');
    await join(secondTab, id);
    secondTab.disconnect();
    await settle(host);
    await settle(host);
    expect(joins).toEqual([]);
    expect(presence).toEqual([]);
  });

  it('marks a disconnected user away, then removes them after the grace period', async () => {
    const { host, part } = await party();
    const away = next(host, 'presence_changed');
    part.disconnect();
    expect(await away).toMatchObject({ userId: 'u-part', presence: 'away' });

    const left = next(host, 'user_left');
    server.clock.advance(GRACE_PERIOD_MS);
    await server.scheduler.runAll();
    expect(await left).toMatchObject({ userId: 'u-part', reason: 'timeout' });
  });

  it('a user who comes back within the grace period stays', async () => {
    const { id, host, part } = await party();
    const away = next(host, 'presence_changed');
    part.disconnect();
    await away;
    const back = next(host, 'presence_changed');
    const again = await server.connect('u-part:Pat');
    const view = await join(again, id);
    expect(await back).toMatchObject({ userId: 'u-part', presence: 'online' });
    expect(view.self.role).toBe('participant');
    server.clock.advance(GRACE_PERIOD_MS);
    await server.scheduler.runAll();
    expect((await server.app.rooms.read(id)).participant('u-part')?.presence).toBe('online');
  });

  it('hands host on when the host leaves', async () => {
    const { id, host, mod } = await party();
    const transferred = next(mod, 'host_transferred');
    expect(await call(host, 'leave_room', { roomId: id })).toMatchObject({ ok: true });
    expect(await transferred).toMatchObject({
      fromUserId: 'u-host',
      toUserId: 'u-mod',
      reason: 'succession',
    });
  });

  it('recovers a dropped connection without losing membership', async () => {
    const id = await roomId();
    const host = await server.connect('u-host:Hana');
    await join(host, id);
    const guest = await server.connect('u-guest:Gus', { reconnection: true });
    await join(guest, id);

    // The socket-level 'connect' (not the manager's 'reconnect') is when `recovered` is known.
    const reconnected = new Promise<void>((resolve) => {
      guest.once('connect', () => {
        resolve();
      });
    });
    (guest.io.engine as unknown as { close: () => void }).close();
    await reconnected;
    expect(guest.recovered).toBe(true);
    await settle(guest);
    expect((await server.app.rooms.read(id)).participant('u-guest')?.presence).toBe('online');
    expect(await call(guest, 'chat_message', { text: 'still here' })).toMatchObject({ ok: true });
  });
});
