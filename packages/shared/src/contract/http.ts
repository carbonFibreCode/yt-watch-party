import { z } from 'zod';
import { ErrorCode } from '../errors';
import { Role, RoomCode, RoomName, VideoUrl } from './primitives';
import { VideoViewSchema } from './views';

/**
 * REST contract (LLD SP-18). Request bodies and responses are zod schemas; types are derived from
 * them, so the server validates input and the client validates what it receives.
 */

export const CreateRoomBody = z.strictObject({
  name: RoomName.optional(),
  videoUrl: VideoUrl.optional(),
});
export type CreateRoomBody = z.infer<typeof CreateRoomBody>;

export const CreateRoomResponse = z.object({ roomId: RoomCode });
export type CreateRoomResponse = z.infer<typeof CreateRoomResponse>;

export const RoomPreview = z.object({
  roomId: RoomCode,
  name: z.string(),
  /** null when the room currently has no members. */
  hostName: z.string().nullable(),
  participantCount: z.number().int().nonnegative(),
  video: VideoViewSchema.nullable(),
});
export type RoomPreview = z.infer<typeof RoomPreview>;

export const RoomSummary = z.object({
  roomId: RoomCode,
  name: z.string(),
  lastRole: Role,
  lastJoinedAt: z.number(),
});
export type RoomSummary = z.infer<typeof RoomSummary>;
export const RoomSummaryList = z.array(RoomSummary);

export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  /** One entry per configured dependency (e.g. `db`, `redis`); true when reachable. */
  checks: z.record(z.string(), z.boolean()),
  uptimeS: z.number(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const HttpErrorResponse = z.object({
  error: z.object({ code: z.enum(Object.values(ErrorCode)), message: z.string() }),
});
export type HttpErrorResponse = z.infer<typeof HttpErrorResponse>;
