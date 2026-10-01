import { describe, expect, it } from 'vitest';
import { MAX_PENDING_REQUESTS_PER_USER, REQUEST_TTL_MS, ROOM_CAPACITY } from '@watchparty/shared';
import { InvariantViolation } from './DomainError';
import type { Participant } from './Participant';
import type { ActionRequest } from './RequestBook';
import { Room } from './Room';
import type { RoomSnapshot } from './snapshot';
import { fullRoom, HOST, MOD, PART, T0, video } from './test/builders';

const busyRoom = (): Room => {
  const room = fullRoom();
  room.changeVideo(video(), 12, T0 + 10);
  room.reportDuration(video().id, 200);
  room.enqueue({ id: 'q1', video: video('bbbbbbbbbbb', 'Next'), addedBy: HOST }, T0 + 20);
  room.createRequest(PART.userId, { type: 'pause' }, 'r1', T0 + 30);
  room.remove(HOST.userId, MOD.userId);
  room.pullEvents();
  return room;
};

const member = (userId: string, role: Participant['role']): Participant => ({
  userId,
  name: userId,
  role,
  presence: 'online',
  awaySince: null,
  joinedAt: T0,
});

const request = (id: string): ActionRequest => ({
  id,
  requester: PART,
  action: { type: 'play' },
  createdAt: T0,
  expiresAt: T0 + REQUEST_TTL_MS,
});

describe('Room snapshots', () => {
  it('round-trips every part of the aggregate', () => {
    const snapshot = busyRoom().toSnapshot();
    expect(Room.fromSnapshot(snapshot).toSnapshot()).toEqual(snapshot);
  });

  it('survives JSON serialization', () => {
    const snapshot = busyRoom().toSnapshot();
    const revived = JSON.parse(JSON.stringify(snapshot)) as RoomSnapshot;
    expect(Room.fromSnapshot(revived).toSnapshot()).toEqual(snapshot);
  });

  it('keeps the loaded version (persistence assigns the next one)', () => {
    const snapshot = { ...busyRoom().toSnapshot(), version: 41 };
    expect(Room.fromSnapshot(snapshot).version).toBe(41);
  });

  it('restores bans and role memory', () => {
    const restored = Room.fromSnapshot(busyRoom().toSnapshot());
    expect(() => restored.join(MOD, T0 + 99)).toThrow('BANNED');
  });

  it('exposes read models', () => {
    const room = busyRoom();
    expect(room.name).toBe('Movie night');
    expect(room.queueItems().map((i) => i.id)).toEqual(['q1']);
    expect(room.pendingRequests().map((r) => r.id)).toEqual(['r1']);
    expect(room.createdAt).toBe(T0);
  });

  describe('invariants', () => {
    const base = (): RoomSnapshot => fullRoom().toSnapshot();

    const withMembers = (members: Participant[], overrides: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
      ...base(),
      ...overrides,
      members: { ...base().members, members, ...overrides.members },
    });

    it.each([
      ['no host among members', withMembers([member('a', 'participant')])],
      ['two hosts', withMembers([member(HOST.userId, 'host'), member('b', 'host')])],
      ['hostId pointing at someone else', withMembers([member('a', 'host')], { hostId: 'b' })],
      [
        'a banned member',
        withMembers([member(HOST.userId, 'host')], {
          members: { members: [member(HOST.userId, 'host')], bans: [HOST.userId], roleMemory: [] },
        }),
      ],
      [
        'too many members',
        withMembers([
          member(HOST.userId, 'host'),
          ...Array.from({ length: ROOM_CAPACITY }, (_, i) => member(`m${String(i)}`, 'participant')),
        ]),
      ],
      [
        'too many pending requests for one user',
        {
          ...base(),
          requests: Array.from({ length: MAX_PENDING_REQUESTS_PER_USER + 1 }, (_, i) =>
            request(`r${String(i)}`),
          ),
        },
      ],
    ])('rejects %s on save', (_label, snapshot) => {
      expect(() => Room.fromSnapshot(snapshot).toSnapshot()).toThrow(InvariantViolation);
    });

    it('accepts an empty room whose last host left', () => {
      const room = Room.fromSnapshot(withMembers([]));
      expect(() => room.toSnapshot()).not.toThrow();
    });
  });
});
