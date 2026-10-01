import { ClientEventSchemas, EMPTY_ACK } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import type { Room } from '../../../domain/Room';
import { SimpleRoomCommand } from '../RoomCommand';
import type { ExecuteArgs } from '../RoomCommand';

/** Any member's player may report the duration; the first report for the current video wins. */
export class ReportDuration extends SimpleRoomCommand<'report_duration'> {
  readonly event = 'report_duration';
  readonly schema = ClientEventSchemas.report_duration;
  readonly capability = null;
  readonly rateRule = 'telemetry';

  protected execute(room: Room, { input }: ExecuteArgs<ClientPayload<'report_duration'>>): EmptyAck {
    room.reportDuration(input.videoId, input.duration);
    return EMPTY_ACK;
  }
}
