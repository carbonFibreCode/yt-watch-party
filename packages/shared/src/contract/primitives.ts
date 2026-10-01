import { z } from 'zod';
import {
  CHAT_MAX_LEN,
  DISPLAY_NAME_MAX_LEN,
  ID_MAX_LEN,
  MAX_MEDIA_SECONDS,
  REACTION_SET,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_NAME_MAX_LEN,
  VIDEO_URL_MAX_LEN,
} from '../constants';

/** Room codes are case-insensitive for humans; normalized to upper case before validation. */
export const RoomCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${String(ROOM_CODE_LENGTH)}}$`));
export type RoomCode = z.infer<typeof RoomCode>;

export const UserId = z.string().min(1).max(ID_MAX_LEN);
export type UserId = z.infer<typeof UserId>;

export const EntityId = z.string().min(1).max(ID_MAX_LEN);
export type EntityId = z.infer<typeof EntityId>;

export const DisplayName = z.string().trim().min(1).max(DISPLAY_NAME_MAX_LEN);
export const RoomName = z.string().trim().min(1).max(ROOM_NAME_MAX_LEN);

export const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
export const VideoId = z.string().regex(VIDEO_ID_PATTERN);
export type VideoId = z.infer<typeof VideoId>;

/** Raw user input; parsed to a VideoId server-side (LLD SP-11). */
export const VideoUrl = z.string().trim().min(1).max(VIDEO_URL_MAX_LEN);

// zod 4 numbers reject Infinity and NaN by default.
export const Seconds = z.number().min(0).max(MAX_MEDIA_SECONDS);
export const Revision = z.number().int().nonnegative();

export const Role = z.enum(['host', 'moderator', 'participant', 'viewer']);
export type Role = z.infer<typeof Role>;

/** `host` can only change hands via transfer_host or succession, never via assign_role. */
export const AssignableRole = Role.exclude(['host']);
export type AssignableRole = z.infer<typeof AssignableRole>;

export const ChatText = z.string().trim().min(1).max(CHAT_MAX_LEN);

export const ReactionEmoji = z.enum(REACTION_SET);
export type ReactionEmoji = z.infer<typeof ReactionEmoji>;
