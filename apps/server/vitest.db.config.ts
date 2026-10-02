import { defineProject } from 'vitest/config';

/** Tests against real Postgres and Redis (docker compose locally, service containers in CI). */
export default defineProject({
  test: {
    name: 'server-db',
    environment: 'node',
    include: ['src/**/*.pg.test.ts', 'src/**/*.redis.test.ts'],
    globalSetup: ['./src/test/db/globalSetup.ts', './src/test/redis/globalSetup.ts'],
    // Postgres suites truncate shared tables, so files must not run concurrently.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
