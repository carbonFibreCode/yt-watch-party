import { ClientEventSchemas, EMPTY_ACK } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import type { Room } from '../../../domain/Room';
import { SimpleRoomCommand } from '../RoomCommand';
import type { ExecuteArgs } from '../RoomCommand';

export class AssignRole extends SimpleRoomCommand<'assign_role'> {
  readonly event = 'assign_role';
  readonly schema = ClientEventSchemas.assign_role;
  readonly capability = 'member.assignRole';
  readonly rateRule = 'moderation';

  protected execute(room: Room, { actor, input }: ExecuteArgs<ClientPayload<'assign_role'>>): EmptyAck {
    room.assignRole(actor.userId, input.userId, input.role);
    return EMPTY_ACK;
  }
}
