import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { inject } from 'vitest';
import { connectRedis } from '../../infrastructure/redis/client';
import type { RedisClient } from '../../infrastructure/redis/client';

export interface TestRedis {
  readonly redis: RedisClient;
  /** Unique per call: every key and stream a test creates lives under it. */
  readonly prefix: string;
  /** Deletes the test's keys and closes the connection. */
  close(): Promise<void>;
}

export const connectTestRedis = async (): Promise<TestRedis> => {
  const redis = await connectRedis(inject('redisUrl'), pino({ level: 'silent' }));
  const prefix = `test:${randomUUID()}:`;
  return {
    redis,
    prefix,
    close: async () => {
      for await (const keys of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
        if (keys.length > 0) {
          await redis.del(keys);
        }
      }
      await redis.quit();
    },
  };
};
