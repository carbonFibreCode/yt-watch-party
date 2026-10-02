import { describe, expect, it } from 'vitest';
import { GRACE_PERIOD_MS } from '@watchparty/shared';
import { RoomHousekeeping } from './RoomHousekeeping';
import { authUser } from './test/fakes';
import { buildHarness } from './test/harness';

const HOST = authUser('u-host', 'Hana');
const GUEST = authUser('u-guest', 'Gus');

describe('RoomHousekeeping', () => {
  it('runs lazy housekeeping now and broadcasts what it produced', async () => {
    const h = buildHarness();
    const { roomId } = await h.roomWith(HOST, GUEST);
    await h.rooms.mutate(roomId, (room, now) => {
      room.markAway(GUEST.userId, now);
    });
    h.clock.advance(GRACE_PERIOD_MS);
    h.broadcaster.clear();
    await new RoomHousekeeping(h.rooms, h.broadcaster, h.logger).sweep(roomId);
    expect(h.broadcaster.eventTypes()).toEqual(['ParticipantLeft']);
  });

  it('ignores rooms that no longer exist', async () => {
    const h = buildHarness();
    await new RoomHousekeeping(h.rooms, h.broadcaster, h.logger).sweep('ZZZZZZ');
    expect(h.logger.entries.filter((e) => e.level === 'error')).toEqual([]);
  });

  it('logs other failures instead of crashing the timer', async () => {
    const h = buildHarness();
    h.roomRepository.load = () => Promise.reject(new Error('store down'));
    await new RoomHousekeeping(h.rooms, h.broadcaster, h.logger).sweep('K7M2QX');
    expect(h.logger.entries.at(-1)).toMatchObject({ level: 'error', message: 'room housekeeping failed' });
  });
});
