import { and, eq, lt } from 'drizzle-orm';
import type { RoomCode } from '@watchparty/shared';
import type { RoomRepository } from '../../application/ports';
import { DomainError } from '../../domain/DomainError';
import type { RoomSnapshot } from '../../domain/snapshot';
import type { Db } from '../db/client';
import { isUniqueViolation } from '../db/errors';
import { rooms } from '../db/schema';
import type { RoomArchive } from './RoomArchive';
import { RoomSnapshotCodec } from './RoomSnapshotCodec';

/** Rooms in Postgres: the `version` column is authoritative for CAS and monotonic flushes. */
export class PostgresRoomRepository implements RoomRepository, RoomArchive {
  constructor(private readonly db: Db) {}

  async create(snapshot: RoomSnapshot): Promise<void> {
    try {
      await this.db
        .insert(rooms)
        .values({ id: snapshot.id, name: snapshot.name, snapshot, version: snapshot.version });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError('CONFLICT');
      }
      throw error;
    }
  }

  async load(id: RoomCode): Promise<RoomSnapshot | null> {
    const [row] = await this.db
      .select({ snapshot: rooms.snapshot, version: rooms.version })
      .from(rooms)
      .where(eq(rooms.id, id));
    return row === undefined ? null : { ...RoomSnapshotCodec.parse(row.snapshot), version: row.version };
  }

  async compareAndSet(snapshot: RoomSnapshot, expectedVersion: number): Promise<boolean> {
    const updated = await this.db
      .update(rooms)
      .set({ name: snapshot.name, snapshot, version: snapshot.version })
      .where(and(eq(rooms.id, snapshot.id), eq(rooms.version, expectedVersion)))
      .returning({ id: rooms.id });
    return updated.length === 1;
  }

  async saveIfNewer(snapshot: RoomSnapshot): Promise<void> {
    await this.db
      .update(rooms)
      .set({ name: snapshot.name, snapshot, version: snapshot.version })
      .where(and(eq(rooms.id, snapshot.id), lt(rooms.version, snapshot.version)));
  }
}
