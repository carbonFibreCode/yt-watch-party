import { z } from 'zod';
import type { AckError } from '../errors';
import { RoomName, VideoUrl } from './primitives';
import type { Role, RoomCode } from './primitives';
import type { VideoView } from './views';

/** REST contract (LLD SP-18). Request bodies are zod-validated; responses are typed. */

export const CreateRoomBody = z.strictObject({
  name: RoomName.optional(),
  videoUrl: VideoUrl.optional(),
});
export type CreateRoomBody = z.infer<typeof CreateRoomBody>;

export interface CreateRoomResponse {
  readonly roomId: RoomCode;
}

export interface RoomPreview {
  readonly roomId: RoomCode;
  readonly name: string;
  readonly hostName: string;
  readonly participantCount: number;
  readonly video: VideoView | null;
}

export interface RoomSummary {
  readonly roomId: RoomCode;
  readonly name: string;
  readonly lastRole: Role;
  readonly lastJoinedAt: number;
}

export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly db: boolean;
  readonly redis: boolean | null;
  readonly uptimeS: number;
}

export interface HttpErrorResponse {
  readonly error: AckError;
}
