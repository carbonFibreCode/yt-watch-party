import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { createDatabase } from '../../infrastructure/db/client';

const DEFAULT_TEST_DATABASE_URL = 'postgres://watchparty:watchparty@localhost:5433/watchparty_test';
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../drizzle', import.meta.url));

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/** Creates the test database if needed and migrates it once per run. */
export async function setup(project: TestProject): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const target = new URL(databaseUrl);
  const name = target.pathname.slice(1);
  const admin = new pg.Client({
    connectionString: Object.assign(new URL(databaseUrl), { pathname: '/postgres' }).toString(),
  });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(`Postgres is not reachable at ${target.host}. Start it with "docker compose up -d".`, {
      cause: error,
    });
  }
  const exists = await admin.query('select 1 from pg_database where datname = $1', [name]);
  if (exists.rowCount === 0) {
    await admin.query(`create database "${name}"`);
  }
  await admin.end();

  const database = createDatabase(databaseUrl, MIGRATIONS_DIR);
  await database.migrate();
  await database.close();
  project.provide('databaseUrl', databaseUrl);
}
