import type { RoomCode } from '@watchparty/shared';
import type { RoomSnapshot } from '../../domain/snapshot';

/** Durable (cold) room storage used behind the hot store (LLD SP-6). */
export interface RoomArchive {
  /** Throws DomainError('CONFLICT') when the code is taken. */
  create(snapshot: RoomSnapshot): Promise<void>;
  load(id: RoomCode): Promise<RoomSnapshot | null>;
  /** Stores the snapshot only if it is newer than the stored version (safe across instances). */
  saveIfNewer(snapshot: RoomSnapshot): Promise<void>;
}
