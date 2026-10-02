import { describe, expect, it } from 'vitest';
import { DEADLINE_CHECK_SLACK_MS, GRACE_PERIOD_MS } from '@watchparty/shared';
import { PresenceService } from './PresenceService';
import { RoomHousekeeping } from './RoomHousekeeping';
import { authUser, ManualScheduler } from './test/fakes';
import { buildHarness } from './test/harness';

const HOST = authUser('u-host', 'Hana');
const GUEST = authUser('u-guest', 'Gus');

const setup = async () => {
  const h = buildHarness();
  const scheduler = new ManualScheduler();
  const housekeeping = new RoomHousekeeping(h.rooms, h.broadcaster, h.logger);
  const presence = new PresenceService(
    h.rooms,
    h.membership,
    h.broadcaster,
    h.presence,
    scheduler,
    housekeeping,
  );
  const { roomId, sessions } = await h.roomWith(HOST, GUEST);
  return { h, scheduler, presence, roomId, host: sessions[0]!, guest: sessions[1]! };
};

describe('PresenceService', () => {
  it('ignores sockets that never joined a room', async () => {
    const { h, presence, scheduler } = await setup();
    await presence.onDisconnect(h.session('u-x'));
    expect(scheduler.tasks.size).toBe(0);
  });

  it('does nothing while the user still has another socket in the room', async () => {
    const { h, presence, scheduler, roomId, guest } = await setup();
    h.presence.set(roomId, GUEST.userId, 1);
    await presence.onDisconnect(guest);
    expect(h.broadcaster.published).toEqual([]);
    expect(scheduler.tasks.size).toBe(0);
  });

  it('marks the user away on their last socket and schedules the grace check', async () => {
    const { h, presence, scheduler, roomId, guest } = await setup();
    await presence.onDisconnect(guest);
    expect((await h.rooms.read(roomId)).participant(GUEST.userId)?.presence).toBe('away');
    expect(h.broadcaster.eventTypes()).toEqual(['PresenceChanged']);
    const key = `grace:${roomId}:${GUEST.userId}`;
    expect([...scheduler.tasks.keys()]).toEqual([key]);
    expect(scheduler.tasks.get(key)?.delayMs).toBe(GRACE_PERIOD_MS + DEADLINE_CHECK_SLACK_MS);
  });

  it('removes the user when the grace period runs out', async () => {
    const { h, presence, scheduler, roomId, guest } = await setup();
    await presence.onDisconnect(guest);
    h.clock.advance(GRACE_PERIOD_MS);
    h.broadcaster.clear();
    await scheduler.runAll();
    expect((await h.rooms.read(roomId)).participant(GUEST.userId)).toBeUndefined();
    expect(h.broadcaster.eventTypes()).toEqual(['ParticipantLeft']);
  });

  it('hands host on when the host does not come back', async () => {
    const { h, presence, scheduler, roomId, host } = await setup();
    await presence.onDisconnect(host);
    h.clock.advance(GRACE_PERIOD_MS);
    await scheduler.runAll();
    expect((await h.rooms.read(roomId)).hostId).toBe(GUEST.userId);
  });

  it('does not schedule anything for a user who is already gone', async () => {
    const { h, presence, scheduler, roomId, guest } = await setup();
    await h.rooms.mutate(roomId, (room) => {
      room.remove(HOST.userId, GUEST.userId);
    });
    await presence.onDisconnect(guest);
    expect(scheduler.tasks.size).toBe(0);
  });

  it('brings a recovered socket back online', async () => {
    const { h, presence, roomId, guest } = await setup();
    await presence.onDisconnect(guest);
    await guest.attach(roomId, 'participant');
    await presence.onRecovered(guest);
    expect((await h.rooms.read(roomId)).participant(GUEST.userId)?.presence).toBe('online');
  });

  it('detaches a recovered socket whose user was removed meanwhile', async () => {
    const { h, presence, roomId, guest } = await setup();
    await h.rooms.mutate(roomId, (room) => {
      room.remove(HOST.userId, GUEST.userId);
    });
    await presence.onRecovered(guest);
    expect(guest.roomId).toBeNull();
  });

  it('ignores recovered sockets that were not in a room', async () => {
    const { h, presence } = await setup();
    await expect(presence.onRecovered(h.session('u-x'))).resolves.toBeUndefined();
  });

  it('propagates unexpected recovery failures', async () => {
    const { presence, guest } = await setup();
    guest.attach = () => Promise.reject(new Error('socket gone'));
    await expect(presence.onRecovered(guest)).rejects.toThrow('socket gone');
  });
});
