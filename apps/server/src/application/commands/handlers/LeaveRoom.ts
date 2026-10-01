import { ClientEventSchemas, EMPTY_ACK } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import { DomainError } from '../../../domain/DomainError';
import type { MembershipService } from '../../MembershipService';
import type { CommandContext, CommandHandler } from '../CommandHandler';

export class LeaveRoom implements CommandHandler<'leave_room'> {
  readonly event = 'leave_room';
  readonly schema = ClientEventSchemas.leave_room;
  readonly capability = null;
  readonly requiresMembership = true;
  readonly rateRule = 'join';

  constructor(private readonly membership: MembershipService) {}

  async handle(payload: ClientPayload<'leave_room'>, { session }: CommandContext): Promise<EmptyAck> {
    if (payload.roomId !== session.roomId) {
      throw new DomainError('NOT_IN_ROOM');
    }
    await this.membership.leave(session);
    return EMPTY_ACK;
  }
}
