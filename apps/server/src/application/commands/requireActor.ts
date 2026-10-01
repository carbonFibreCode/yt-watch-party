import { DomainError } from '../../domain/DomainError';
import type { Participant } from '../../domain/Participant';
import type { CommandContext } from './CommandHandler';

/** For side-channel handlers that require membership: the actor resolved by the pipeline. */
export const requireActor = (ctx: CommandContext): Participant => {
  if (ctx.actor === null) {
    throw new DomainError('NOT_IN_ROOM');
  }
  return ctx.actor;
};
