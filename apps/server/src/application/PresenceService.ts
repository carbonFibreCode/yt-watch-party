import { DEADLINE_CHECK_SLACK_MS, GRACE_PERIOD_MS } from '@watchparty/shared';
import { DomainError } from '../domain/DomainError';
import type { MembershipService } from './MembershipService';
import type { Broadcaster, PresenceProbe, RealtimeSession, Scheduler } from './ports';
import type { RoomHousekeeping } from './RoomHousekeeping';
import type { RoomService } from './RoomService';

/**
 * Connection lifecycle → room presence (LLD SP-9). Correctness never depends on the timer:
 * every RoomService.mutate reaps lazily, the timer only makes the "left" event arrive on time.
 */
export class PresenceService {
  constructor(
    private readonly rooms: RoomService,
    private readonly membership: MembershipService,
    private readonly broadcaster: Broadcaster,
    private readonly probe: PresenceProbe,
    private readonly scheduler: Scheduler,
    private readonly housekeeping: RoomHousekeeping,
  ) {}

  /** A socket closed: when it was the user's last one in the room, mark them away and start the grace period. */
  async onDisconnect(session: RealtimeSession): Promise<void> {
    const { roomId } = session;
    if (roomId === null) {
      return;
    }
    const { userId } = session.user;
    if ((await this.probe.countSockets(roomId, userId)) > 0) {
      return;
    }
    const {
      result: markedAway,
      room,
      events,
    } = await this.rooms.mutate(roomId, (r, now) => {
      if (r.participant(userId)?.presence !== 'online') {
        return false;
      }
      r.markAway(userId, now);
      return true;
    });
    await this.broadcaster.publish(room, events);
    if (markedAway) {
      this.scheduler.schedule(`grace:${roomId}:${userId}`, GRACE_PERIOD_MS + DEADLINE_CHECK_SLACK_MS, () =>
        this.housekeeping.sweep(roomId),
      );
    }
  }

  /** A socket came back through connection-state recovery: its rooms are restored, bring the user back online. */
  async onRecovered(session: RealtimeSession): Promise<void> {
    const { roomId } = session;
    if (roomId === null) {
      return;
    }
    try {
      await this.membership.join(session, roomId);
    } catch (error) {
      if (!(error instanceof DomainError)) {
        throw error;
      }
      await session.detach();
    }
  }
}
