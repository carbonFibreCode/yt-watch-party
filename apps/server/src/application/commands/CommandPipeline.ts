import { ackError, ackOk } from '@watchparty/shared';
import type { AckData, AckResult, ClientEventName, ErrorCode } from '@watchparty/shared';
import { DomainError } from '../../domain/DomainError';
import type { Clock, CommandOutcome, Logger, Metrics, RateLimiter, RealtimeSession } from '../ports';
import type { RoomService } from '../RoomService';
import type { CommandHandler } from './CommandHandler';
import { authorize } from './middleware/authorize';
import { resolveMembership } from './middleware/membership';
import { enforceRateLimit } from './middleware/rateLimit';
import { validatePayload } from './middleware/validate';

const EXPECTED_REJECTIONS: ReadonlySet<ErrorCode> = new Set(['FORBIDDEN', 'RATE_LIMITED', 'BANNED']);

export interface CommandPipelineDeps {
  readonly rooms: RoomService;
  readonly limiter: RateLimiter;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly metrics: Metrics;
}

/**
 * The one path every client event takes (LLD SP-7):
 * validate → rate limit → membership → authorize → handle → ack. Cross-cutting concerns are
 * written once here; handlers only contain their own behavior.
 */
export class CommandPipeline {
  constructor(private readonly deps: CommandPipelineDeps) {}

  async run<E extends ClientEventName>(
    handler: CommandHandler<E>,
    raw: unknown,
    session: RealtimeSession,
  ): Promise<AckResult<AckData[E]>> {
    const startedAt = this.deps.clock.now();
    const fields = { event: handler.event, userId: session.user.userId, roomId: session.roomId };
    try {
      const payload = validatePayload(handler, raw);
      await enforceRateLimit(this.deps.limiter, handler, session);
      const actor = await resolveMembership(this.deps.rooms, handler, session);
      authorize(handler, actor);
      const data = await handler.handle(payload, { session, user: session.user, actor });
      const durationMs = this.finish(handler.event, 'ok', startedAt);
      this.deps.logger.debug({ ...fields, outcome: 'ok', durationMs }, 'command');
      return ackOk(data);
    } catch (error) {
      return this.reject(error, handler.event, fields, startedAt);
    }
  }

  private reject<T>(error: unknown, event: ClientEventName, fields: object, startedAt: number): AckResult<T> {
    if (error instanceof DomainError) {
      const durationMs = this.finish(event, 'rejected', startedAt);
      const level = EXPECTED_REJECTIONS.has(error.code) ? 'warn' : 'debug';
      this.deps.logger[level](
        { ...fields, outcome: 'rejected', errorCode: error.code, durationMs },
        'command',
      );
      return ackError(error.code);
    }
    const durationMs = this.finish(event, 'failed', startedAt);
    this.deps.logger.error({ ...fields, outcome: 'failed', err: error, durationMs }, 'command failed');
    return ackError('INTERNAL');
  }

  /** Records the outcome once, for logs and metrics alike; returns the duration. */
  private finish(event: ClientEventName, outcome: CommandOutcome, startedAt: number): number {
    const durationMs = this.deps.clock.now() - startedAt;
    this.deps.metrics.commandHandled(event, outcome, durationMs);
    return durationMs;
  }
}
