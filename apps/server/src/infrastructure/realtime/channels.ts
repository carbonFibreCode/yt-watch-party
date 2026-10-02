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

const ROOM_CHANNEL = /^room:[^:]+$/;

/** True for a whole-room channel (not a staff or per-user one). */
export const isRoomChannel = (channel: string): boolean => ROOM_CHANNEL.test(channel);
