import { describe, expect, it } from 'vitest';
import { DEADLINE_CHECK_SLACK_MS, REQUEST_TTL_MS } from '@watchparty/shared';
import { RequestExpiryWatcher } from './RequestExpiryWatcher';
import { RoomHousekeeping } from './RoomHousekeeping';
import { authUser, ManualScheduler } from './test/fakes';
import { buildHarness } from './test/harness';

const HOST = authUser('u-host', 'Hana');
const PART = authUser('u-part', 'Pat');

const setup = async () => {
  const h = buildHarness();
  const scheduler = new ManualScheduler();
  const watcher = new RequestExpiryWatcher(
    new RoomHousekeeping(h.rooms, h.broadcaster, h.logger),
    scheduler,
    h.clock,
  );
  const { roomId } = await h.roomWith(HOST, PART);
  return { h, scheduler, watcher, roomId };
};

describe('RequestExpiryWatcher', () => {
  it('schedules a check at the new request’s deadline and announces the expiry then', async () => {
    const { h, scheduler, watcher, roomId } = await setup();
    const { room, events } = await h.rooms.mutate(roomId, (r, now) => {
      r.createRequest(PART.userId, { type: 'pause' }, 'r1', now);
    });
    watcher.onEvents(room, events);
    expect(scheduler.tasks.get('request:r1')?.delayMs).toBe(REQUEST_TTL_MS + DEADLINE_CHECK_SLACK_MS);

    h.clock.advance(REQUEST_TTL_MS);
    h.broadcaster.clear();
    await scheduler.runAll();
    expect(h.broadcaster.published.flatMap((p) => p.events)).toEqual([
      { type: 'RequestResolved', requestId: 'r1', requesterId: PART.userId, status: 'expired' },
    ]);
  });

  it('ignores other events and requests already gone', async () => {
    const { h, scheduler, watcher, roomId } = await setup();
    const room = await h.rooms.read(roomId);
    watcher.onEvents(room, [{ type: 'PlaybackChanged' }, { type: 'RequestCreated', requestId: 'missing' }]);
    expect(scheduler.tasks.size).toBe(0);
  });

  it('a request resolved before its deadline makes the check a no-op', async () => {
    const { h, scheduler, watcher, roomId } = await setup();
    const { room, events } = await h.rooms.mutate(roomId, (r, now) => {
      r.createRequest(PART.userId, { type: 'pause' }, 'r1', now);
    });
    watcher.onEvents(room, events);
    await h.rooms.mutate(roomId, (r, now) => r.resolveRequest(HOST.userId, 'r1', false, now));
    h.clock.advance(REQUEST_TTL_MS);
    h.broadcaster.clear();
    await scheduler.runAll();
    expect(h.broadcaster.eventTypes()).toEqual([]);
  });
});
