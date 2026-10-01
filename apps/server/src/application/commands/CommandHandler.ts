import type { z } from 'zod';
import type { AckData, Capability, ClientEventName, ClientPayload, RateRule } from '@watchparty/shared';
import type { Participant } from '../../domain/Participant';
import type { AuthUser, RealtimeSession } from '../ports';

/** What a handler sees (ISP): the caller and, for room commands, their membership at dispatch time. */
export interface CommandContext {
  readonly session: RealtimeSession;
  readonly user: AuthUser;
  /** Set by the membership step for handlers that require membership; null otherwise. */
  readonly actor: Participant | null;
}

/** Declarative policy the pipeline enforces for every handler (rules.md §8.3). */
export interface CommandPolicy {
  /** null = any member (or anyone, when membership is not required). */
  readonly capability: Capability | null;
  readonly requiresMembership: boolean;
  readonly rateRule: RateRule;
}

/** One class per client event (LLD SP-7, Command pattern). */
export interface CommandHandler<E extends ClientEventName> extends CommandPolicy {
  readonly event: E;
  /** Must be `ClientEventSchemas[event]`; a registry test enforces it. */
  readonly schema: z.ZodType<ClientPayload<E>>;
  handle(payload: ClientPayload<E>, ctx: CommandContext): Promise<AckData[E]>;
}
