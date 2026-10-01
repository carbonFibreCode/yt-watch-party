import type { UserRef } from '@watchparty/shared';
import { Room } from '../Room';
import type { VideoRef } from '../VideoRef';

export const T0 = 1_700_000_000_000;
export const ROOM_ID = 'K7M2QX';

export const user = (userId: string, name: string = userId): UserRef => ({ userId, name });

export const HOST = user('u-host', 'Hana');
export const MOD = user('u-mod', 'Mo');
export const PART = user('u-part', 'Pat');
export const VIEWER = user('u-view', 'Vic');
export const NEWBIE = user('u-new', 'Nia');

export const video = (id = 'dQw4w9WgXcQ', title = 'Never Gonna Give You Up'): VideoRef => ({
  id,
  title,
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
});

/** A freshly created room whose host has connected. Events are drained. */
export const hostedRoom = (now = T0): Room => {
  const room = Room.create({ id: ROOM_ID, name: 'Movie night', host: HOST, now });
  room.join(HOST, now);
  room.pullEvents();
  return room;
};

/**
 * Host + moderator + participant + viewer, joined one millisecond apart in that order.
 * Events are drained so tests only see what they cause.
 */
export const fullRoom = (now = T0): Room => {
  const room = hostedRoom(now);
  room.join(MOD, now + 1);
  room.join(PART, now + 2);
  room.join(VIEWER, now + 3);
  room.assignRole(HOST.userId, MOD.userId, 'moderator');
  room.assignRole(HOST.userId, VIEWER.userId, 'viewer');
  room.pullEvents();
  return room;
};

export const roleOf = (room: Room, userId: string): string | undefined => room.participant(userId)?.role;
