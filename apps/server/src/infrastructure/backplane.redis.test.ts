import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMITS } from '@watchparty/shared';
import { DomainError } from '../domain/DomainError';
import { connectTestRedis } from '../test/redis/testRedis';
import type { TestRedis } from '../test/redis/testRedis';
import { createRedisBackplane } from './backplane';
import { RateLimiterFlexibleAdapter } from './ratelimit/RateLimiterFlexibleAdapter';

let t: TestRedis;

beforeEach(async () => {
  t = await connectTestRedis();
});

afterEach(async () => {
  await t.close();
});

describe('Redis backplane', () => {
  it('shares one rate-limit budget across instances', async () => {
    const { limiterFactory } = createRedisBackplane(t.redis, t.prefix);
    const instanceA = new RateLimiterFlexibleAdapter(limiterFactory);
    const instanceB = new RateLimiterFlexibleAdapter(limiterFactory);
    for (let i = 0; i < RATE_LIMITS.requests.points; i += 1) {
      await (i % 2 === 0 ? instanceA : instanceB).consume('requests', 'u1');
    }
    await expect(instanceB.consume('requests', 'u1')).rejects.toEqual(new DomainError('RATE_LIMITED'));
    await expect(instanceA.consume('requests', 'u2')).resolves.toBeUndefined();
  });

  it('falls back to in-memory limits while Redis is unreachable', async () => {
    const outage = await connectTestRedis();
    const limiter = new RateLimiterFlexibleAdapter(
      createRedisBackplane(outage.redis, outage.prefix).limiterFactory,
    );
    outage.redis.destroy();
    for (let i = 0; i < RATE_LIMITS.requests.points; i += 1) {
      await limiter.consume('requests', 'u1');
    }
    await expect(limiter.consume('requests', 'u1')).rejects.toEqual(new DomainError('RATE_LIMITED'));
  });

  it('reports Redis health', async () => {
    const { healthChecks } = createRedisBackplane(t.redis, t.prefix);
    expect(await Promise.all(healthChecks.map((h) => h.check()))).toEqual([true]);
  });
});
