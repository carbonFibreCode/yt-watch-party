import { PermissionPolicy } from '@watchparty/shared';
import type { Capability, RoomCode, UserId } from '@watchparty/shared';
import { DomainError } from '../../domain/DomainError';
import type { Participant } from '../../domain/Participant';
import type { Room } from '../../domain/Room';
import type { RealtimeSession } from '../ports';

/** Capability checks shared by the pipeline and the in-transaction re-check (LLD SP-7). */

export const requireRoomId = (session: RealtimeSession): RoomCode => {
  if (session.roomId === null) {
    throw new DomainError('NOT_IN_ROOM');
  }
  return session.roomId;
};

export const requireMember = (room: Room, userId: UserId): Participant => {
  const member = room.participant(userId);
  if (member === undefined) {
    throw new DomainError('NOT_IN_ROOM');
  }
  return member;
};

export const assertCapability = (actor: Participant, capability: Capability | null): void => {
  if (capability !== null && !PermissionPolicy.can(actor.role, capability)) {
    throw new DomainError('FORBIDDEN');
  }
};

/** Membership + capability against a given (fresh) room state. */
export const authorizeIn = (room: Room, userId: UserId, capability: Capability | null): Participant => {
  const actor = requireMember(room, userId);
  assertCapability(actor, capability);
  return actor;
};
