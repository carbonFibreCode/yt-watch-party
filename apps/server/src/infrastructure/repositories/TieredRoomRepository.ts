import type { RoomCode } from '@watchparty/shared';
import type { RoomRepository } from '../../application/ports';
import { DomainError } from '../../domain/DomainError';
import type { RoomSnapshot } from '../../domain/snapshot';
import type { RoomArchive } from './RoomArchive';
import type { SnapshotFlusher } from './SnapshotFlusher';

/**
 * Decorator combining a hot store (memory/Redis) with a durable archive (LLD SP-6):
 * write-through on create (shared links work immediately), read-through on miss,
 * write-behind on every commit. The database never sits on the realtime path.
 */
export class TieredRoomRepository implements RoomRepository {
  constructor(
    private readonly hot: RoomRepository,
    private readonly cold: RoomArchive,
    private readonly flusher: SnapshotFlusher,
  ) {}

  async create(snapshot: RoomSnapshot): Promise<void> {
    await this.cold.create(snapshot);
    await this.hot.create(snapshot);
  }

  async load(id: RoomCode): Promise<RoomSnapshot | null> {
    const hot = await this.hot.load(id);
    if (hot !== null) {
      return hot;
    }
    const archived = await this.cold.load(id);
    const pending = this.flusher.pending(id);
    const latest =
      pending !== undefined && (archived === null || pending.version > archived.version) ? pending : archived;
    if (latest === null) {
      return null;
    }
    return this.seed(latest);
  }

  async compareAndSet(snapshot: RoomSnapshot, expectedVersion: number): Promise<boolean> {
    const committed = await this.hot.compareAndSet(snapshot, expectedVersion);
    if (committed) {
      this.flusher.markDirty(snapshot);
    }
    return committed;
  }

  /** Puts an archived room back into the hot store; if another caller won the race, use theirs. */
  private async seed(snapshot: RoomSnapshot): Promise<RoomSnapshot | null> {
    try {
      await this.hot.create(snapshot);
      return snapshot;
    } catch (error) {
      if (error instanceof DomainError && error.code === 'CONFLICT') {
        return this.hot.load(snapshot.id);
      }
      throw error;
    }
  }
}
