import { ClientEventSchemas } from '@watchparty/shared';
import type { ClientPayload, RequestableAction } from '@watchparty/shared';
import { PlaybackCommand } from '../PlaybackCommand';

export class ChangeVideo extends PlaybackCommand<'change_video'> {
  readonly event = 'change_video';
  readonly schema = ClientEventSchemas.change_video;

  protected toAction(payload: ClientPayload<'change_video'>): RequestableAction {
    return { type: 'change_video', ...payload };
  }
}
