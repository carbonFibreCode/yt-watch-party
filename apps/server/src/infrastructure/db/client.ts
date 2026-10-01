import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { DB_POOL_MAX } from '@watchparty/shared';
import { schema } from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** Arbitrary constant identifying our migration lock in pg_advisory_lock. */
const MIGRATION_LOCK_KEY = 7_340_211;

export interface Database {
  readonly db: Db;
  ping(): Promise<boolean>;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

/**
 * One pooled connection to Postgres (Neon pooled endpoint in production). `migrationsDir` is the
 * drizzle-kit output folder, resolved by the entry point (its location differs between src and dist).
 */
export const createDatabase = (connectionString: string, migrationsDir: string): Database => {
  const pool = new Pool({ connectionString, max: DB_POOL_MAX });
  const db = drizzle(pool, { schema });
  return {
    db,
    ping: async () => {
      await db.execute(sql`select 1`);
      return true;
    },
    /** Serialized across instances with an advisory lock, so concurrent boots cannot race. */
    migrate: async () => {
      const lockHolder = await pool.connect();
      try {
        await lockHolder.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
        await migrate(db, { migrationsFolder: migrationsDir });
      } finally {
        await lockHolder.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
        lockHolder.release();
      }
    },
    close: () => pool.end(),
  };
};
