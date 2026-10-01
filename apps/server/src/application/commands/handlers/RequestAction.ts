import { ClientEventSchemas } from '@watchparty/shared';
import type { ClientPayload, RequestActionAck } from '@watchparty/shared';
import type { RequestedAction } from '../../../domain/RequestBook';
import type { Room } from '../../../domain/Room';
import type { IdGenerator } from '../../ports';
import type { RequestedActions } from '../../RequestedActions';
import { RoomCommand } from '../RoomCommand';
import type { ExecuteArgs, RoomCommandDeps } from '../RoomCommand';

/** A participant asks staff to perform a playback action (LLD SP-10). */
export class RequestAction extends RoomCommand<'request_action', RequestedAction> {
  readonly event = 'request_action';
  readonly schema = ClientEventSchemas.request_action;
  readonly capability = 'request.create';
  readonly rateRule = 'requests';

  constructor(
    deps: RoomCommandDeps,
    private readonly actions: RequestedActions,
    private readonly ids: IdGenerator,
  ) {
    super(deps);
  }

  /** Resolves the URL now, so the requester learns about an invalid video immediately. */
  protected prepare(payload: ClientPayload<'request_action'>): Promise<RequestedAction> {
    return this.actions.prepare(payload.action);
  }

  protected execute(room: Room, { actor, input, now }: ExecuteArgs<RequestedAction>): RequestActionAck {
    const request = room.createRequest(actor.userId, input, this.ids.next(), now);
    return { requestId: request.id, expiresAt: request.expiresAt };
  }
}
