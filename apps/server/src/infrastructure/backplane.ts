import { createAdapter } from '@socket.io/redis-streams-adapter';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import type { ServerOptions } from 'socket.io';
import type { HealthCheck } from './http/app';
import { memoryLimiterFactory } from './ratelimit/RateLimiterFlexibleAdapter';
import type { LimiterFactory } from './ratelimit/RateLimiterFlexibleAdapter';
import type { RedisClient } from './redis/client';

/**
 * What instances share besides storage (LLD SP-19), chosen as one Strategy by the entry point:
 * the Socket.IO adapter (cross-instance fan-out, cluster-wide `fetchSockets`/`socketsJoin`) and
 * the rate-limit store.
 */
export interface Backplane {
  /** Absent: Socket.IO's in-memory adapter (one instance). */
  readonly adapter?: ServerOptions['adapter'];
  readonly limiterFactory: LimiterFactory;
  readonly healthChecks: readonly HealthCheck[];
}

/** Single instance: everything in process. */
export const localBackplane: Backplane = { limiterFactory: memoryLimiterFactory, healthChecks: [] };

/**
 * Redis Streams adapter (compatible with connection state recovery, unlike the pub/sub adapter)
 * and Redis token buckets. Each limiter falls back to an in-memory one while Redis is unreachable,
 * so an outage degrades rate limiting to per-instance instead of failing every command.
 * `prefix` namespaces every key and the stream, which keeps parallel test runs apart.
 */
export const createRedisBackplane = (redis: RedisClient, prefix = 'wp:'): Backplane => {
  // createAdapter opens its reader connections immediately, so defer it until Socket.IO asks.
  let adapter: ReturnType<typeof createAdapter> | undefined;
  // Socket.IO invokes the factory with `new`, so it must be a function, not an arrow function.
  const lazyAdapter = function (nsp: Parameters<ReturnType<typeof createAdapter>>[0]) {
    adapter ??= createAdapter(redis, {
      streamName: `${prefix}sio`,
      sessionKeyPrefix: `${prefix}sio:session:`,
    });
    return adapter(nsp);
  };
  return {
    adapter: lazyAdapter,
    limiterFactory: (config) =>
      new RateLimiterRedis({
        ...config,
        keyPrefix: `${prefix}${config.keyPrefix}`,
        storeClient: redis,
        useRedisPackage: true,
        insuranceLimiter: new RateLimiterMemory(config),
      }),
    healthChecks: [{ name: 'redis', check: () => Promise.resolve(redis.isReady) }],
  };
};
