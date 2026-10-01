import { ClientEventSchemas } from '@watchparty/shared';
import type { ClientPayload, RequestableAction } from '@watchparty/shared';
import { PlaybackCommand } from '../PlaybackCommand';

export class QueueAdd extends PlaybackCommand<'queue_add'> {
  readonly event = 'queue_add';
  readonly schema = ClientEventSchemas.queue_add;

  protected toAction(payload: ClientPayload<'queue_add'>): RequestableAction {
    return { type: 'queue_add', ...payload };
  }
}
