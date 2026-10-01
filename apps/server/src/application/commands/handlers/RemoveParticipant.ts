import { ClientEventSchemas, EMPTY_ACK } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import type { Room } from '../../../domain/Room';
import { SimpleRoomCommand } from '../RoomCommand';
import type { ExecuteArgs } from '../RoomCommand';

export class RemoveParticipant extends SimpleRoomCommand<'remove_participant'> {
  readonly event = 'remove_participant';
  readonly schema = ClientEventSchemas.remove_participant;
  readonly capability = 'member.remove';
  readonly rateRule = 'moderation';

  protected execute(
    room: Room,
    { actor, input }: ExecuteArgs<ClientPayload<'remove_participant'>>,
  ): EmptyAck {
    room.remove(actor.userId, input.userId);
    return EMPTY_ACK;
  }
}
