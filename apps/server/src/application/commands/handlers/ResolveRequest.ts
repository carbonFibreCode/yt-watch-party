import { ClientEventSchemas, EMPTY_ACK } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import type { Room } from '../../../domain/Room';
import type { RequestedActions } from '../../RequestedActions';
import { assertCapability } from '../authorization';
import { SimpleRoomCommand } from '../RoomCommand';
import type { ExecuteArgs, RoomCommandDeps } from '../RoomCommand';

/**
 * Staff approve or reject a request. On approval the action runs through the same
 * RequestedActions.apply as a direct command, credited to the requester, in the same commit (LLD SP-10).
 */
export class ResolveRequest extends SimpleRoomCommand<'resolve_request'> {
  readonly event = 'resolve_request';
  readonly schema = ClientEventSchemas.resolve_request;
  readonly capability = 'request.resolve';
  readonly rateRule = 'moderation';

  constructor(
    deps: RoomCommandDeps,
    private readonly actions: RequestedActions,
  ) {
    super(deps);
  }

  protected execute(
    room: Room,
    { actor, input, now }: ExecuteArgs<ClientPayload<'resolve_request'>>,
  ): EmptyAck {
    const request = room.resolveRequest(actor.userId, input.requestId, input.approve, now);
    if (input.approve) {
      assertCapability(actor, 'playback.control');
      this.actions.apply(room, request.action, request.requester, now);
    }
    return EMPTY_ACK;
  }
}
