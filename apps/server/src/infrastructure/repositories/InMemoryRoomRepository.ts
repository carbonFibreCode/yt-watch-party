import { LRUCache } from 'lru-cache';
import { HOT_ROOM_TTL_S } from '@watchparty/shared';
import type { RoomCode } from '@watchparty/shared';
import type { RoomRepository } from '../../application/ports';
import { DomainError } from '../../domain/DomainError';
import type { RoomSnapshot } from '../../domain/snapshot';
import { RoomSnapshotCodec } from './RoomSnapshotCodec';

const MS_PER_SECOND = 1000;

/**
 * Process-local room store: the hot tier in front of Postgres, or the whole store in tests.
 * Rooms idle for HOT_ROOM_TTL_S are evicted (read-through brings them back from the archive).
 * Stores encoded JSON like the Redis store does, so callers can never alias stored state.
 */
export class InMemoryRoomRepository implements RoomRepository {
  private readonly rooms: LRUCache<RoomCode, string>;

  constructor(ttlMs: number = HOT_ROOM_TTL_S * MS_PER_SECOND) {
    this.rooms = new LRUCache({ ttl: ttlMs, ttlAutopurge: true, updateAgeOnGet: true });
  }

  create(snapshot: RoomSnapshot): Promise<void> {
    if (this.rooms.has(snapshot.id)) {
      return Promise.reject(new DomainError('CONFLICT'));
    }
    this.rooms.set(snapshot.id, RoomSnapshotCodec.encode(snapshot));
    return Promise.resolve();
  }

  load(id: RoomCode): Promise<RoomSnapshot | null> {
    const json = this.rooms.get(id);
    return Promise.resolve(json === undefined ? null : RoomSnapshotCodec.decode(json));
  }

  async compareAndSet(snapshot: RoomSnapshot, expectedVersion: number): Promise<boolean> {
    const current = await this.load(snapshot.id);
    if (current?.version !== expectedVersion) {
      return false;
    }
    this.rooms.set(snapshot.id, RoomSnapshotCodec.encode(snapshot));
    return true;
  }
}
