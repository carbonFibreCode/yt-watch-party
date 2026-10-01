import { ackError, ackOk } from '@watchparty/shared';
import type { AckData, AckResult, ClientEventName, ErrorCode } from '@watchparty/shared';
import { DomainError } from '../../domain/DomainError';
import type { Clock, Logger, RateLimiter, RealtimeSession } from '../ports';
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
      this.deps.logger.debug({ ...fields, outcome: 'ok', durationMs: this.elapsed(startedAt) }, 'command');
      return ackOk(data);
    } catch (error) {
      return this.reject(error, { ...fields, durationMs: this.elapsed(startedAt) });
    }
  }

  private reject<T>(error: unknown, fields: object): AckResult<T> {
    if (error instanceof DomainError) {
      const level = EXPECTED_REJECTIONS.has(error.code) ? 'warn' : 'debug';
      this.deps.logger[level]({ ...fields, outcome: 'rejected', errorCode: error.code }, 'command');
      return ackError(error.code);
    }
    this.deps.logger.error({ ...fields, outcome: 'failed', err: error }, 'command failed');
    return ackError('INTERNAL');
  }

  private elapsed(startedAt: number): number {
    return this.deps.clock.now() - startedAt;
  }
}
