import { describe, expect, it } from 'vitest';
import { GRACE_PERIOD_MS } from '@watchparty/shared';
import { DomainError } from './DomainError';
import { Room } from './Room';
import {
  fullRoom,
  HOST,
  hostedRoom,
  MOD,
  NEWBIE,
  PART,
  ROOM_ID,
  roleOf,
  T0,
  user,
  VIEWER,
} from './test/builders';

describe('Room membership', () => {
  describe('create', () => {
    it('makes the creator host, away until their socket joins', () => {
      const room = Room.create({ id: ROOM_ID, name: 'Movie night', host: HOST, now: T0 });
      expect(room.hostId).toBe(HOST.userId);
      expect(room.participant(HOST.userId)).toMatchObject({ role: 'host', presence: 'away' });
      expect(room.pullEvents()).toEqual([]);
    });

    it('hands the room to the first joiner if the creator never connects', () => {
      const room = Room.create({ id: ROOM_ID, name: 'Movie night', host: HOST, now: T0 });
      room.join(PART, T0 + 1_000);
      room.reapAway(T0 + GRACE_PERIOD_MS);
      expect(room.hostId).toBe(PART.userId);
      expect(room.participant(HOST.userId)).toBeUndefined();
    });
  });

  describe('join', () => {
    it('brings the creator online without a joined event', () => {
      const room = Room.create({ id: ROOM_ID, name: 'Movie night', host: HOST, now: T0 });
      const result = room.join(HOST, T0 + 500);
      expect(result.isNew).toBe(false);
      expect(result.participant.presence).toBe('online');
      expect(room.pullEvents()).toEqual([
        { type: 'PresenceChanged', userId: HOST.userId, presence: 'online' },
      ]);
    });

    it('admits newcomers as participants and announces them', () => {
      const room = hostedRoom();
      const result = room.join(NEWBIE, T0 + 10);
      expect(result).toMatchObject({ isNew: true, participant: { role: 'participant' } });
      expect(room.pullEvents()).toEqual([
        { type: 'ParticipantJoined', userId: NEWBIE.userId, name: NEWBIE.name, role: 'participant' },
      ]);
    });

    it('is idempotent for a member opening another tab', () => {
      const room = fullRoom();
      const result = room.join(PART, T0 + 100);
      expect(result.isNew).toBe(false);
      expect(room.pullEvents()).toEqual([]);
      expect(room.participants()).toHaveLength(4);
    });

    it('updates the display name on rejoin', () => {
      const room = fullRoom();
      room.join(user(PART.userId, 'Patricia'), T0 + 100);
      expect(room.participant(PART.userId)?.name).toBe('Patricia');
    });

    it('rejects banned users', () => {
      const room = fullRoom();
      room.remove(HOST.userId, PART.userId);
      expect(() => room.join(PART, T0 + 100)).toThrow(new DomainError('BANNED'));
    });

    it('restores a remembered role on return', () => {
      const room = fullRoom();
      room.leave(MOD.userId);
      room.join(MOD, T0 + 100);
      expect(roleOf(room, MOD.userId)).toBe('moderator');
    });

    it('makes the newcomer host of an empty room', () => {
      const room = hostedRoom();
      room.leave(HOST.userId);
      room.join(NEWBIE, T0 + 100);
      expect(room.hostId).toBe(NEWBIE.userId);
      expect(roleOf(room, NEWBIE.userId)).toBe('host');
    });

    it('returns a former host whose role was handed on as moderator', () => {
      const room = fullRoom();
      room.leave(HOST.userId);
      room.join(HOST, T0 + 100);
      expect(roleOf(room, HOST.userId)).toBe('moderator');
      expect(room.hostId).toBe(MOD.userId);
    });
  });

  describe('presence and grace', () => {
    it('marks a member away once and announces it', () => {
      const room = fullRoom();
      room.markAway(PART.userId, T0 + 10);
      room.markAway(PART.userId, T0 + 20);
      expect(room.participant(PART.userId)).toMatchObject({ presence: 'away', awaySince: T0 + 10 });
      expect(room.pullEvents()).toEqual([{ type: 'PresenceChanged', userId: PART.userId, presence: 'away' }]);
    });

    it('brings a member back online within the grace period without leave/join events', () => {
      const room = fullRoom();
      room.markAway(PART.userId, T0 + 10);
      room.pullEvents();
      room.join(PART, T0 + 5_000);
      room.reapAway(T0 + GRACE_PERIOD_MS + 10);
      expect(room.participant(PART.userId)?.presence).toBe('online');
      expect(room.pullEvents()).toEqual([
        { type: 'PresenceChanged', userId: PART.userId, presence: 'online' },
      ]);
    });

    it('does nothing before the grace period ends', () => {
      const room = fullRoom();
      room.markAway(PART.userId, T0 + 10);
      room.pullEvents();
      room.reapAway(T0 + GRACE_PERIOD_MS);
      expect(room.participant(PART.userId)).toBeDefined();
      expect(room.pullEvents()).toEqual([]);
    });

    it('removes members whose grace period ran out', () => {
      const room = fullRoom();
      room.markAway(PART.userId, T0 + 10);
      room.pullEvents();
      room.reapAway(T0 + 10 + GRACE_PERIOD_MS);
      expect(room.participant(PART.userId)).toBeUndefined();
      expect(room.pullEvents()).toEqual([
        { type: 'ParticipantLeft', userId: PART.userId, name: PART.name, reason: 'timeout' },
      ]);
    });

    it('passes host to the best online member when the host times out', () => {
      const room = fullRoom();
      room.markAway(HOST.userId, T0 + 10);
      room.markAway(MOD.userId, T0 + 10);
      room.pullEvents();
      room.reapAway(T0 + 10 + GRACE_PERIOD_MS);
      expect(room.hostId).toBe(PART.userId);
      expect(room.pullEvents()).toEqual([
        { type: 'ParticipantLeft', userId: HOST.userId, name: HOST.name, reason: 'timeout' },
        { type: 'ParticipantLeft', userId: MOD.userId, name: MOD.name, reason: 'timeout' },
        { type: 'HostTransferred', fromUserId: HOST.userId, toUserId: PART.userId, reason: 'succession' },
      ]);
    });
  });

  describe('leave', () => {
    it('removes the member and announces it', () => {
      const room = fullRoom();
      room.leave(PART.userId);
      expect(room.pullEvents()).toEqual([
        { type: 'ParticipantLeft', userId: PART.userId, name: PART.name, reason: 'left' },
      ]);
    });

    it('hands host to the moderator, by rank then join order', () => {
      const room = fullRoom();
      room.leave(HOST.userId);
      expect(room.hostId).toBe(MOD.userId);
      expect(roleOf(room, MOD.userId)).toBe('host');
      expect(room.pullEvents()).toContainEqual({
        type: 'HostTransferred',
        fromUserId: HOST.userId,
        toUserId: MOD.userId,
        reason: 'succession',
      });
    });

    it('leaves an empty room without a host member', () => {
      const room = hostedRoom();
      room.leave(HOST.userId);
      expect(room.participants()).toEqual([]);
      expect(room.pullEvents()).toEqual([
        { type: 'ParticipantLeft', userId: HOST.userId, name: HOST.name, reason: 'left' },
      ]);
    });

    it('rejects leaving for a non-member', () => {
      expect(() => {
        hostedRoom().leave('ghost');
      }).toThrow(new DomainError('TARGET_NOT_FOUND'));
    });
  });

  describe('remove', () => {
    it('lets the host remove anyone else and bans them', () => {
      const room = fullRoom();
      room.remove(HOST.userId, MOD.userId);
      expect(room.participant(MOD.userId)).toBeUndefined();
      expect(room.pullEvents()).toEqual([
        { type: 'ParticipantRemoved', userId: MOD.userId, name: MOD.name, byRole: 'host' },
      ]);
    });

    it.each([
      ['participant', PART],
      ['viewer', VIEWER],
    ])('lets a moderator remove a %s', (_label, target) => {
      const room = fullRoom();
      room.remove(MOD.userId, target.userId);
      expect(room.participant(target.userId)).toBeUndefined();
    });

    it.each([
      ['a moderator removing the host', MOD, HOST],
      ['a moderator removing themselves', MOD, MOD],
      ['a viewer removing a participant', VIEWER, PART],
      ['the host removing themselves', HOST, HOST],
    ])('forbids %s', (_label, actor, target) => {
      expect(() => {
        fullRoom().remove(actor.userId, target.userId);
      }).toThrow(new DomainError('FORBIDDEN'));
    });

    it('does not let a removed moderator regain their role', () => {
      const room = fullRoom();
      room.remove(HOST.userId, MOD.userId);
      expect(() => room.join(MOD, T0 + 50)).toThrow(new DomainError('BANNED'));
    });
  });

  describe('assignRole', () => {
    it('lets the host promote and demote', () => {
      const room = fullRoom();
      room.assignRole(HOST.userId, PART.userId, 'moderator');
      room.assignRole(HOST.userId, MOD.userId, 'viewer');
      expect(roleOf(room, PART.userId)).toBe('moderator');
      expect(roleOf(room, MOD.userId)).toBe('viewer');
      expect(room.pullEvents()).toEqual([
        {
          type: 'RoleAssigned',
          userId: PART.userId,
          name: PART.name,
          role: 'moderator',
          previousRole: 'participant',
        },
        {
          type: 'RoleAssigned',
          userId: MOD.userId,
          name: MOD.name,
          role: 'viewer',
          previousRole: 'moderator',
        },
      ]);
    });

    it('treats assigning the current role as a no-op', () => {
      const room = fullRoom();
      room.assignRole(HOST.userId, PART.userId, 'participant');
      expect(room.pullEvents()).toEqual([]);
    });

    it('forbids the host changing their own role', () => {
      expect(() => {
        fullRoom().assignRole(HOST.userId, HOST.userId, 'moderator');
      }).toThrow(new DomainError('FORBIDDEN'));
    });

    it('forbids targeting the host', () => {
      expect(() => {
        fullRoom().assignRole(MOD.userId, HOST.userId, 'viewer');
      }).toThrow(new DomainError('FORBIDDEN'));
    });

    it('rejects unknown targets', () => {
      expect(() => {
        fullRoom().assignRole(HOST.userId, 'ghost', 'moderator');
      }).toThrow(new DomainError('TARGET_NOT_FOUND'));
    });
  });

  describe('transferHost', () => {
    it('swaps host and moderator', () => {
      const room = fullRoom();
      room.transferHost(HOST.userId, PART.userId);
      expect(room.hostId).toBe(PART.userId);
      expect(roleOf(room, PART.userId)).toBe('host');
      expect(roleOf(room, HOST.userId)).toBe('moderator');
      expect(room.pullEvents()).toEqual([
        { type: 'HostTransferred', fromUserId: HOST.userId, toUserId: PART.userId, reason: 'manual' },
      ]);
    });

    it.each([
      ['a non-host', MOD, PART],
      ['the host to themselves', HOST, HOST],
    ])('forbids %s', (_label, actor, target) => {
      expect(() => {
        fullRoom().transferHost(actor.userId, target.userId);
      }).toThrow(new DomainError('FORBIDDEN'));
    });

    it('refuses an away target', () => {
      const room = fullRoom();
      room.markAway(PART.userId, T0 + 5);
      expect(() => {
        room.transferHost(HOST.userId, PART.userId);
      }).toThrow(new DomainError('TARGET_OFFLINE'));
    });
  });
});
