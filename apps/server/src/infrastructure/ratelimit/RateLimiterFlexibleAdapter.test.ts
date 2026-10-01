import { describe, expect, it } from 'vitest';
import { RATE_LIMITS } from '@watchparty/shared';
import { DomainError } from '../../domain/DomainError';
import { RateLimiterFlexibleAdapter } from './RateLimiterFlexibleAdapter';
import type { LimiterFactory } from './RateLimiterFlexibleAdapter';

describe('RateLimiterFlexibleAdapter', () => {
  it('allows the configured number of points, then rejects with RATE_LIMITED', async () => {
    const limiter = new RateLimiterFlexibleAdapter();
    for (let i = 0; i < RATE_LIMITS.requests.points; i += 1) {
      await limiter.consume('requests', 'u1');
    }
    await expect(limiter.consume('requests', 'u1')).rejects.toEqual(new DomainError('RATE_LIMITED'));
  });

  it('keeps buckets separate per user and per rule', async () => {
    const limiter = new RateLimiterFlexibleAdapter();
    for (let i = 0; i < RATE_LIMITS.requests.points; i += 1) {
      await limiter.consume('requests', 'u1');
    }
    await expect(limiter.consume('requests', 'u2')).resolves.toBeUndefined();
    await expect(limiter.consume('chat', 'u1')).resolves.toBeUndefined();
  });

  it('builds each rule from the shared limits table', async () => {
    const configs: unknown[] = [];
    const factory: LimiterFactory = (config) => {
      configs.push(config);
      return { consume: () => Promise.resolve() } as unknown as ReturnType<LimiterFactory>;
    };
    const limiter = new RateLimiterFlexibleAdapter(factory);
    await limiter.consume('chat', 'u1');
    await limiter.consume('chat', 'u2');
    expect(configs).toEqual([{ keyPrefix: 'rl:chat', points: 5, duration: 5 }]);
  });

  it('propagates store failures instead of masking them as rate limits', async () => {
    const failure = new Error('redis down');
    const factory: LimiterFactory = () =>
      ({ consume: () => Promise.reject(failure) }) as unknown as ReturnType<LimiterFactory>;
    await expect(new RateLimiterFlexibleAdapter(factory).consume('chat', 'u1')).rejects.toBe(failure);
  });
});
