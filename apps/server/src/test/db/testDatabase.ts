import { sql } from 'drizzle-orm';
import { inject } from 'vitest';
import { createDatabase } from '../../infrastructure/db/client';
import type { Database } from '../../infrastructure/db/client';
import { MIGRATIONS_DIR } from './globalSetup';

/** A connection to the migrated test database; call `reset()` before each test. */
export const testDatabase = (): Database & { reset(): Promise<void> } => {
  const database = createDatabase(inject('databaseUrl'), MIGRATIONS_DIR);
  return {
    ...database,
    reset: async () => {
      await database.db.execute(
        sql`truncate table "chat_messages", "room_memberships", "rooms", "session", "account", "verification", "user" cascade`,
      );
    },
  };
};
