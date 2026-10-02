import type { RoomCode } from '@watchparty/shared';
import { DomainError } from '../domain/DomainError';
import type { Broadcaster, Logger } from './ports';
import type { RoomService } from './RoomService';

/**
 * Runs a room's lazy housekeeping now (reap expired presence, expire requests) and broadcasts
 * whatever it produced (LLD SP-9, SP-10). Used by timers so deadlines are announced on time;
 * correctness never depends on them, since every mutation housekeeps first anyway.
 */
export class RoomHousekeeping {
  constructor(
    private readonly rooms: RoomService,
    private readonly broadcaster: Broadcaster,
    private readonly logger: Logger,
  ) {}

  async sweep(roomId: RoomCode): Promise<void> {
    try {
      const { room, events } = await this.rooms.mutate(roomId, () => undefined);
      await this.broadcaster.publish(room, events);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'ROOM_NOT_FOUND') {
        return;
      }
      this.logger.error({ err: error, roomId }, 'room housekeeping failed');
    }
  }
}
