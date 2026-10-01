import { z } from 'zod';
import { Role, RoomCode, UserId, VideoId } from '@watchparty/shared';
import type { RoomSnapshot } from '../../domain/snapshot';

/**
 * Serialization for persisted rooms (rules.md §7.2: the store is a trust boundary). Typed as
 * `z.ZodType<RoomSnapshot>`, so the schema cannot drift from the domain type. Shared by every
 * RoomRepository implementation (DRY).
 */
const VideoRefSchema = z.object({ id: VideoId, title: z.string(), thumbnailUrl: z.string() });
const UserRefSchema = z.object({ userId: UserId, name: z.string() });

const RequestedActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('seek'), time: z.number() }),
  z.object({ type: z.literal('change_video'), video: VideoRefSchema, startAt: z.number() }),
  z.object({ type: z.literal('queue_add'), video: VideoRefSchema }),
]);

const RoomSnapshotSchema: z.ZodType<RoomSnapshot> = z.object({
  id: RoomCode,
  name: z.string(),
  hostId: UserId,
  createdAt: z.number(),
  version: z.number().int().nonnegative(),
  members: z.object({
    members: z.array(
      z.object({
        userId: UserId,
        name: z.string(),
        role: Role,
        presence: z.enum(['online', 'away']),
        awaySince: z.number().nullable(),
        joinedAt: z.number(),
      }),
    ),
    bans: z.array(UserId),
    roleMemory: z.array(z.tuple([UserId, Role])),
  }),
  playback: z.object({
    video: VideoRefSchema.nullable(),
    isPlaying: z.boolean(),
    anchorPosition: z.number(),
    anchorTime: z.number(),
    duration: z.number().nullable(),
    rev: z.number().int().nonnegative(),
  }),
  queue: z.array(z.object({ id: z.string(), video: VideoRefSchema, addedBy: UserRefSchema })),
  requests: z.array(
    z.object({
      id: z.string(),
      requester: UserRefSchema,
      action: RequestedActionSchema,
      createdAt: z.number(),
      expiresAt: z.number(),
    }),
  ),
});

export const RoomSnapshotCodec = {
  encode: (snapshot: RoomSnapshot): string => JSON.stringify(snapshot),
  /** Throws on corrupt or incompatible stored data instead of loading a broken aggregate. */
  decode: (json: string): RoomSnapshot => RoomSnapshotSchema.parse(JSON.parse(json)),
  /** For stores that already hand back parsed JSON (e.g. Postgres jsonb). */
  parse: (value: unknown): RoomSnapshot => RoomSnapshotSchema.parse(value),
} as const;
