import { SNAPSHOT_FLUSH_MS } from '@watchparty/shared';
import type { RoomCode } from '@watchparty/shared';
import type { Logger } from '../../application/ports';
import type { RoomSnapshot } from '../../domain/snapshot';
import type { RoomArchive } from './RoomArchive';

const newer = (a: RoomSnapshot | undefined, b: RoomSnapshot | undefined): RoomSnapshot | undefined =>
  a === undefined || (b !== undefined && b.version > a.version) ? b : a;

/**
 * Write-behind of hot room state to the archive (LLD SP-6). Keeps the latest snapshot per room
 * until it is durably saved, so readers can always see something at least as new as the archive.
 */
export class SnapshotFlusher {
  private readonly dirty = new Map<RoomCode, RoomSnapshot>();
  private readonly inFlight = new Map<RoomCode, RoomSnapshot>();
  private timer: NodeJS.Timeout | undefined;
  private flushing: Promise<void> | undefined;

  constructor(
    private readonly archive: RoomArchive,
    private readonly logger: Logger,
    private readonly intervalMs: number = SNAPSHOT_FLUSH_MS,
  ) {}

  markDirty(snapshot: RoomSnapshot): void {
    const latest = newer(this.dirty.get(snapshot.id), snapshot);
    if (latest !== undefined) {
      this.dirty.set(snapshot.id, latest);
    }
  }

  /** The newest not-yet-durable snapshot of a room, if any. */
  pending(id: RoomCode): RoomSnapshot | undefined {
    return newer(this.inFlight.get(id), this.dirty.get(id));
  }

  start(): void {
    this.timer ??= setInterval(() => {
      void this.flush();
    }, this.intervalMs);
    this.timer.unref();
  }

  /** Writes everything dirty; concurrent callers share the same in-progress flush. */
  flush(): Promise<void> {
    this.flushing ??= this.writeAll().finally(() => {
      this.flushing = undefined;
    });
    return this.flushing;
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.flush();
    if (this.dirty.size > 0) {
      await this.flush();
    }
  }

  private async writeAll(): Promise<void> {
    const batch = [...this.dirty.values()];
    this.dirty.clear();
    for (const snapshot of batch) {
      this.inFlight.set(snapshot.id, snapshot);
      try {
        await this.archive.saveIfNewer(snapshot);
      } catch (error) {
        this.logger.error({ err: error, roomId: snapshot.id }, 'snapshot flush failed, will retry');
        this.markDirty(snapshot);
      } finally {
        this.inFlight.delete(snapshot.id);
      }
    }
  }
}
