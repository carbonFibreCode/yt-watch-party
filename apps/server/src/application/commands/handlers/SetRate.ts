import { ClientEventSchemas } from '@watchparty/shared';
import type { ClientPayload, RequestableAction } from '@watchparty/shared';
import { PlaybackCommand } from '../PlaybackCommand';

/** Playback speed for the whole room; participants can request it like any playback change. */
export class SetRate extends PlaybackCommand<'set_rate'> {
  readonly event = 'set_rate';
  readonly schema = ClientEventSchemas.set_rate;

  protected toAction(payload: ClientPayload<'set_rate'>): RequestableAction {
    return { type: 'set_rate', ...payload };
  }
}
