import { RoomCode } from '@watchparty/shared';
import type { RoomCode as RoomCodeType } from '@watchparty/shared';

const ROOM_PATH = /\/r\/([^/?#]+)/;

/** Accepts a room code ("k7m2qx") or a shared link (".../r/K7M2QX") and returns the code. */
export const parseJoinInput = (input: string): RoomCodeType | null => {
  const direct = RoomCode.safeParse(input);
  if (direct.success) {
    return direct.data;
  }
  const fromLink = ROOM_PATH.exec(input)?.[1];
  if (fromLink === undefined) {
    return null;
  }
  const parsed = RoomCode.safeParse(fromLink);
  return parsed.success ? parsed.data : null;
};
