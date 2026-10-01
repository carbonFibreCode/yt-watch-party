import type { RoomCode } from '@watchparty/shared';
import type { RoomSnapshot } from '../../../domain/snapshot';
import { InMemoryRoomRepository } from '../InMemoryRoomRepository';
import type { RoomArchive } from '../RoomArchive';

/** RoomArchive fake: the in-memory store plus monotonic `saveIfNewer`, with failure injection. */
export class InMemoryArchive implements RoomArchive {
  readonly store = new InMemoryRoomRepository();
  saves = 0;
  failNext = 0;

  create(snapshot: RoomSnapshot): Promise<void> {
    return this.store.create(snapshot);
  }

  load(id: RoomCode): Promise<RoomSnapshot | null> {
    return this.store.load(id);
  }

  async saveIfNewer(snapshot: RoomSnapshot): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('archive unavailable');
    }
    this.saves += 1;
    const current = await this.store.load(snapshot.id);
    if (current === null) {
      await this.store.create(snapshot);
    } else if (current.version < snapshot.version) {
      await this.store.compareAndSet(snapshot, current.version);
    }
  }
}
