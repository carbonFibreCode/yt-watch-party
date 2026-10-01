import type { RateLimiter, RealtimeSession } from '../../ports';
import type { CommandPolicy } from '../CommandHandler';

/** Step 2: per-user token bucket for the handler's rule (LLD SP-17). Runs after validation. */
export const enforceRateLimit = async (
  limiter: RateLimiter,
  policy: CommandPolicy,
  session: RealtimeSession,
): Promise<void> => {
  await limiter.consume(policy.rateRule, session.user.userId);
};
