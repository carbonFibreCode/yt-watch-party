import { createClient } from 'redis';
import type { TestProject } from 'vitest/node';

const DEFAULT_TEST_REDIS_URL = 'redis://localhost:6380';

declare module 'vitest' {
  export interface ProvidedContext {
    redisUrl: string;
  }
}

/** Checks Redis is reachable once per run; suites isolate themselves with unique key prefixes. */
export async function setup(project: TestProject): Promise<void> {
  const redisUrl = process.env.TEST_REDIS_URL ?? DEFAULT_TEST_REDIS_URL;
  const client = createClient({ url: redisUrl, socket: { reconnectStrategy: false } });
  client.on('error', () => undefined);
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`Redis is not reachable at ${redisUrl}. Start it with "docker compose up -d".`, {
      cause: error,
    });
  }
  await client.quit();
  project.provide('redisUrl', redisUrl);
}
