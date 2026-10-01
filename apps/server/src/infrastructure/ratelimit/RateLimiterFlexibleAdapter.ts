import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import type { RateLimiterAbstract, RateLimiterStoreAbstract } from 'rate-limiter-flexible';
import { RATE_LIMITS } from '@watchparty/shared';
import type { RateRule } from '@watchparty/shared';
import type { RateLimiter } from '../../application/ports';
import { DomainError } from '../../domain/DomainError';

export interface RuleConfig {
  readonly keyPrefix: string;
  readonly points: number;
  readonly duration: number;
}

/** Builds the limiter for one rule; memory now, Redis-backed in Phase 12 (Strategy). */
export type LimiterFactory = (config: RuleConfig) => RateLimiterAbstract | RateLimiterStoreAbstract;

export const memoryLimiterFactory: LimiterFactory = (config) => new RateLimiterMemory(config);

/** Adapter over `rate-limiter-flexible` (LLD SP-17): one token bucket per rule, keyed by user. */
export class RateLimiterFlexibleAdapter implements RateLimiter {
  private readonly limiters = new Map<RateRule, RateLimiterAbstract | RateLimiterStoreAbstract>();

  constructor(private readonly factory: LimiterFactory = memoryLimiterFactory) {}

  async consume(rule: RateRule, key: string): Promise<void> {
    try {
      await this.limiterFor(rule).consume(key);
    } catch (rejection) {
      if (rejection instanceof RateLimiterRes) {
        throw new DomainError('RATE_LIMITED');
      }
      throw rejection;
    }
  }

  private limiterFor(rule: RateRule): RateLimiterAbstract | RateLimiterStoreAbstract {
    let limiter = this.limiters.get(rule);
    if (limiter === undefined) {
      const { points, durationS } = RATE_LIMITS[rule];
      limiter = this.factory({ keyPrefix: `rl:${rule}`, points, duration: durationS });
      this.limiters.set(rule, limiter);
    }
    return limiter;
  }
}
