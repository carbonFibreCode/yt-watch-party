import { ackError, CLIENT_EVENT_NAMES } from '@watchparty/shared';
import type { AckResult, ClientEventName } from '@watchparty/shared';
import type { RealtimeSession } from '../ports';
import type { CommandHandler } from './CommandHandler';
import type { CommandPipeline } from './CommandPipeline';

export type CommandRunner = (raw: unknown, session: RealtimeSession) => Promise<AckResult<unknown>>;

/**
 * event → handler (LLD SP-7, Open/Closed). Each handler is bound to the pipeline while its event
 * type is still known statically, so dispatch by runtime event name needs no casts or switch.
 */
export class CommandRegistry {
  private readonly runners = new Map<string, CommandRunner>();

  constructor(private readonly pipeline: CommandPipeline) {}

  register<E extends ClientEventName>(handler: CommandHandler<E>): this {
    if (this.runners.has(handler.event)) {
      throw new Error(`Duplicate handler for "${handler.event}"`);
    }
    this.runners.set(handler.event, (raw, session) => this.pipeline.run(handler, raw, session));
    return this;
  }

  /** Unknown event names are treated as malformed input, never as a crash. */
  dispatch(event: string, raw: unknown, session: RealtimeSession): Promise<AckResult<unknown>> {
    const runner = this.runners.get(event);
    return runner === undefined ? Promise.resolve(ackError('VALIDATION_FAILED')) : runner(raw, session);
  }

  events(): readonly string[] {
    return [...this.runners.keys()];
  }

  /** Fails fast at boot if any contract event has no handler. */
  assertComplete(): void {
    const missing = CLIENT_EVENT_NAMES.filter((event) => !this.runners.has(event));
    if (missing.length > 0) {
      throw new Error(`Missing command handlers: ${missing.join(', ')}`);
    }
  }
}
