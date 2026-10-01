import { EMPTY_ACK } from '@watchparty/shared';
import type { AckData, ClientPayload, RequestableAction, RequestableActionType } from '@watchparty/shared';
import type { RequestedAction } from '../../domain/RequestBook';
import type { Room } from '../../domain/Room';
import type { RequestedActions } from '../RequestedActions';
import { RoomCommand } from './RoomCommand';
import type { ExecuteArgs, RoomCommandDeps } from './RoomCommand';

/**
 * A playback command a participant could also request (LLD SP-10). Both the direct command and
 * an approved request run through RequestedActions, so there is one implementation per action.
 */
export abstract class PlaybackCommand<E extends RequestableActionType> extends RoomCommand<
  E,
  RequestedAction
> {
  readonly capability = 'playback.control';
  readonly rateRule = 'playback';

  constructor(
    deps: RoomCommandDeps,
    private readonly actions: RequestedActions,
  ) {
    super(deps);
  }

  protected abstract toAction(payload: ClientPayload<E>): RequestableAction;

  protected prepare(payload: ClientPayload<E>): Promise<RequestedAction> {
    return this.actions.prepare(this.toAction(payload));
  }

  protected execute(room: Room, { actor, input, now }: ExecuteArgs<RequestedAction>): AckData[E] {
    this.actions.apply(room, input, actor, now);
    return EMPTY_ACK;
  }
}
