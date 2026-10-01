import { DomainError } from '../../../domain/DomainError';
import type { Participant } from '../../../domain/Participant';
import { assertCapability } from '../authorization';
import type { CommandPolicy } from '../CommandHandler';

/** Step 4: fail fast on capability before any I/O-heavy prepare phase (LLD SP-3, SP-7). */
export const authorize = (policy: CommandPolicy, actor: Participant | null): void => {
  if (policy.capability === null) {
    return;
  }
  if (actor === null) {
    throw new DomainError('NOT_IN_ROOM');
  }
  assertCapability(actor, policy.capability);
};
