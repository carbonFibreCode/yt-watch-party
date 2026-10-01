import type { ClientEventName, ClientPayload } from '@watchparty/shared';
import { DomainError } from '../../../domain/DomainError';
import type { CommandHandler } from '../CommandHandler';

/** Step 1: runtime validation against the shared contract (rules.md §7.2). */
export const validatePayload = <E extends ClientEventName>(
  handler: CommandHandler<E>,
  raw: unknown,
): ClientPayload<E> => {
  const parsed = handler.schema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError('VALIDATION_FAILED');
  }
  return parsed.data;
};
