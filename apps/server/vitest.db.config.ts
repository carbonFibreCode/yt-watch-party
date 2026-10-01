import { defineProject } from 'vitest/config';

/** Tests against a real Postgres (docker compose locally, a service container in CI). */
export default defineProject({
  test: {
    name: 'server-db',
    environment: 'node',
    include: ['src/**/*.pg.test.ts'],
    globalSetup: ['./src/test/db/globalSetup.ts'],
    // Suites truncate shared tables, so files must not run concurrently.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
