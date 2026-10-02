import type { ChatRepository, Logger, MembershipRepository, RoomRepository } from '../application/ports';
import type { Database } from './db/client';
import type { HealthCheck } from './http/app';
import { InMemoryChatRepository } from './repositories/InMemoryChatRepository';
import { InMemoryMembershipRepository } from './repositories/InMemoryMembershipRepository';
import { InMemoryRoomRepository } from './repositories/InMemoryRoomRepository';
import { PgChatRepository } from './repositories/PgChatRepository';
import { PgMembershipRepository } from './repositories/PgMembershipRepository';
import { PostgresRoomRepository } from './repositories/PostgresRoomRepository';
import { SnapshotFlusher } from './repositories/SnapshotFlusher';
import { TieredRoomRepository } from './repositories/TieredRoomRepository';

/** Every store the app needs, chosen as one Strategy by the entry point (LLD SP-6, SP-19). */
export interface Persistence {
  readonly rooms: RoomRepository;
  readonly chat: ChatRepository;
  readonly memberships: MembershipRepository;
  readonly healthChecks: readonly HealthCheck[];
  start(): void;
  /** Flushes pending writes; the caller owns closing the database itself. */
  stop(): Promise<void>;
}

/** Process-local only: tests and throwaway runs. */
export const createMemoryPersistence = (): Persistence => ({
  rooms: new InMemoryRoomRepository(),
  chat: new InMemoryChatRepository(),
  memberships: new InMemoryMembershipRepository(),
  healthChecks: [],
  start: () => undefined,
  stop: () => Promise.resolve(),
});

/**
 * Hot rooms (in memory, or in Redis when instances share them) with write-behind to Postgres;
 * chat and memberships straight to Postgres.
 */
export const createPostgresPersistence = (
  database: Database,
  logger: Logger,
  hot: RoomRepository = new InMemoryRoomRepository(),
): Persistence => {
  const archive = new PostgresRoomRepository(database.db);
  const flusher = new SnapshotFlusher(archive, logger);
  return {
    rooms: new TieredRoomRepository(hot, archive, flusher),
    chat: new PgChatRepository(database.db),
    memberships: new PgMembershipRepository(database.db),
    healthChecks: [{ name: 'db', check: () => database.ping() }],
    start: () => {
      flusher.start();
    },
    stop: () => flusher.stop(),
  };
};
