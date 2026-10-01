import { ClientEventSchemas } from '@watchparty/shared';
import type { RequestableAction } from '@watchparty/shared';
import { PlaybackCommand } from '../PlaybackCommand';

export class Play extends PlaybackCommand<'play'> {
  readonly event = 'play';
  readonly schema = ClientEventSchemas.play;

  protected toAction(): RequestableAction {
    return { type: 'play' };
  }
}
