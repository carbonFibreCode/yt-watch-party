import type { RoomCode, UserId } from '@watchparty/shared';

/** Every TanStack Query key in one place, so invalidation never guesses at shapes. */
export const queryKeys = {
  roomPreview: (roomId: RoomCode) => ['room-preview', roomId] as const,
  myRooms: (userId: UserId | undefined) => ['me', 'rooms', userId] as const,
} as const;
