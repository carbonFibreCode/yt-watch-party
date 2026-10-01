import type { RoomCode, UserId } from '@watchparty/shared';
import type { MemberRegistrySnapshot } from './MemberRegistry';
import type { PlaybackSnapshot } from './PlaybackState';
import type { ActionRequest } from './RequestBook';
import type { QueueItem } from './VideoQueue';

/**
 * The persisted, JSON-serializable form of a Room (LLD SP-6). `version` is owned by the
 * persistence layer: it is the value the snapshot was loaded with and is used for CAS.
 */
export interface RoomSnapshot {
  readonly id: RoomCode;
  readonly name: string;
  readonly hostId: UserId;
  readonly createdAt: number;
  readonly version: number;
  readonly members: MemberRegistrySnapshot;
  readonly playback: PlaybackSnapshot;
  readonly queue: readonly QueueItem[];
  readonly requests: readonly ActionRequest[];
}
