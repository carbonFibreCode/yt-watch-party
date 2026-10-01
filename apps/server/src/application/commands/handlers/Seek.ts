import { ClientEventSchemas } from '@watchparty/shared';
import type { ClientPayload, RequestableAction } from '@watchparty/shared';
import { PlaybackCommand } from '../PlaybackCommand';

export class Seek extends PlaybackCommand<'seek'> {
  readonly event = 'seek';
  readonly schema = ClientEventSchemas.seek;

  protected toAction(payload: ClientPayload<'seek'>): RequestableAction {
    return { type: 'seek', ...payload };
  }
}
