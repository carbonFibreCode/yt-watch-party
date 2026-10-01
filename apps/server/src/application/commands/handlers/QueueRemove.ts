import { ClientEventSchemas, EMPTY_ACK } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import type { Room } from '../../../domain/Room';
import { SimpleRoomCommand } from '../RoomCommand';
import type { ExecuteArgs } from '../RoomCommand';

export class QueueRemove extends SimpleRoomCommand<'queue_remove'> {
  readonly event = 'queue_remove';
  readonly schema = ClientEventSchemas.queue_remove;
  readonly capability = 'playback.control';
  readonly rateRule = 'playback';

  protected execute(room: Room, { input }: ExecuteArgs<ClientPayload<'queue_remove'>>): EmptyAck {
    room.dequeue(input.itemId);
    return EMPTY_ACK;
  }
}
