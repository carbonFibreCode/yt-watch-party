import { ClientEventSchemas } from '@watchparty/shared';
import type { RequestableAction } from '@watchparty/shared';
import { PlaybackCommand } from '../PlaybackCommand';

export class Pause extends PlaybackCommand<'pause'> {
  readonly event = 'pause';
  readonly schema = ClientEventSchemas.pause;

  protected toAction(): RequestableAction {
    return { type: 'pause' };
  }
}
