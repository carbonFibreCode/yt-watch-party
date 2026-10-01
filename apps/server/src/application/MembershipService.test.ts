import { describe, expect, it } from 'vitest';
import { authUser, FakeSession } from './test/fakes';
import { buildHarness } from './test/harness';

const HOST = authUser('u-host', 'Hana');
const GUEST = authUser('u-guest', 'Gus');

describe('MembershipService', () => {
  it('joins: attaches the session with the role, records membership, broadcasts, returns the room', async () => {
    const h = buildHarness();
    const { roomId } = await h.roomWith(HOST);
    const session = new FakeSession(GUEST);
    const ack = await h.membership.join(session, roomId);
    expect(session.roomId).toBe(roomId);
    expect(session.attachedRole).toBe('participant');
    expect(ack.room.self).toMatchObject({ userId: GUEST.userId, role: 'participant' });
    expect(ack.chatHistory).toEqual([]);
    expect(h.broadcaster.eventTypes()).toEqual(['ParticipantJoined']);
    expect(await h.memberships.recentForUser(GUEST.userId, 5)).toMatchObject([
      { roomId, lastRole: 'participant' },
    ]);
  });

  it('switching rooms leaves the previous one first', async () => {
    const h = buildHarness();
    const first = await h.roomWith(HOST, GUEST);
    const second = await h.rooms.create('Second', HOST);
    const guestSession = first.sessions[1]!;
    await h.membership.join(guestSession, second.id);
    expect((await h.rooms.read(first.roomId)).participant(GUEST.userId)).toBeUndefined();
    expect(guestSession.roomId).toBe(second.id);
  });

  it('leaving with another tab still open keeps the user in the room', async () => {
    const h = buildHarness();
    const { roomId, sessions } = await h.roomWith(HOST, GUEST);
    h.presence.set(roomId, GUEST.userId, 1);
    await h.membership.leave(sessions[1]!);
    expect(sessions[1]!.detachCount).toBe(1);
    expect((await h.rooms.read(roomId)).participant(GUEST.userId)).toBeDefined();
    expect(h.broadcaster.published).toEqual([]);
  });

  it('leaving from the last tab removes the user', async () => {
    const h = buildHarness();
    const { roomId, sessions } = await h.roomWith(HOST, GUEST);
    await h.membership.leave(sessions[1]!);
    expect((await h.rooms.read(roomId)).participant(GUEST.userId)).toBeUndefined();
    expect(h.broadcaster.eventTypes()).toEqual(['ParticipantLeft']);
  });

  it('leaving is a no-op for a detached session or a user no longer in the room', async () => {
    const h = buildHarness();
    await h.membership.leave(new FakeSession(GUEST));
    const { roomId, sessions } = await h.roomWith(HOST, GUEST);
    await h.rooms.mutate(roomId, (room) => {
      room.remove(HOST.userId, GUEST.userId);
    });
    h.broadcaster.clear();
    await h.membership.leave(sessions[1]!);
    expect(h.broadcaster.eventTypes()).toEqual([]);
  });
});
