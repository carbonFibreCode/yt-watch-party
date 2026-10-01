import { ClientEventSchemas, EMPTY_ACK } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import type { Room } from '../../../domain/Room';
import { SimpleRoomCommand } from '../RoomCommand';
import type { ExecuteArgs } from '../RoomCommand';

/** Any member may report the end; the domain only accepts a valid, current, non-early report. */
export class VideoEnded extends SimpleRoomCommand<'video_ended'> {
  readonly event = 'video_ended';
  readonly schema = ClientEventSchemas.video_ended;
  readonly capability = null;
  readonly rateRule = 'telemetry';

  protected execute(room: Room, { input, now }: ExecuteArgs<ClientPayload<'video_ended'>>): EmptyAck {
    room.videoEnded(input.videoId, input.rev, now);
    return EMPTY_ACK;
  }
}
