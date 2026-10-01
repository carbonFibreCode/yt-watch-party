import type { RoomCode, UserId } from '@watchparty/shared';

/** The single place Socket.IO room (channel) names are built (LLD SP-8). */
export const ch = {
  /** Everyone in the room. */
  room: (roomId: RoomCode): string => `room:${roomId}`,
  /** Host and moderators. */
  staff: (roomId: RoomCode): string => `room:${roomId}:staff`,
  /** Every tab of one user in one room. */
  user: (roomId: RoomCode, userId: UserId): string => `room:${roomId}:user:${userId}`,
} as const;
