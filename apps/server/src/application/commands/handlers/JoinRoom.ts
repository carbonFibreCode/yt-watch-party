import { ClientEventSchemas } from '@watchparty/shared';
import type { ClientPayload, JoinRoomAck } from '@watchparty/shared';
import type { MembershipService } from '../../MembershipService';
import type { CommandContext, CommandHandler } from '../CommandHandler';

export class JoinRoom implements CommandHandler<'join_room'> {
  readonly event = 'join_room';
  readonly schema = ClientEventSchemas.join_room;
  readonly capability = null;
  readonly requiresMembership = false;
  readonly rateRule = 'join';

  constructor(private readonly membership: MembershipService) {}

  handle(payload: ClientPayload<'join_room'>, { session }: CommandContext): Promise<JoinRoomAck> {
    return this.membership.join(session, payload.roomId);
  }
}
