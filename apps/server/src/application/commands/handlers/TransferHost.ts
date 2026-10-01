import { ClientEventSchemas, EMPTY_ACK } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import type { Room } from '../../../domain/Room';
import { SimpleRoomCommand } from '../RoomCommand';
import type { ExecuteArgs } from '../RoomCommand';

export class TransferHost extends SimpleRoomCommand<'transfer_host'> {
  readonly event = 'transfer_host';
  readonly schema = ClientEventSchemas.transfer_host;
  readonly capability = 'host.transfer';
  readonly rateRule = 'moderation';

  protected execute(room: Room, { actor, input }: ExecuteArgs<ClientPayload<'transfer_host'>>): EmptyAck {
    room.transferHost(actor.userId, input.userId);
    return EMPTY_ACK;
  }
}
