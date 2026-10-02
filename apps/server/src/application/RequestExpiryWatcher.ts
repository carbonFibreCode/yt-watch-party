import { DEADLINE_CHECK_SLACK_MS } from '@watchparty/shared';
import type { DomainEvent } from '../domain/events';
import type { Room } from '../domain/Room';
import type { Clock, RoomEventListener, Scheduler } from './ports';
import type { RoomHousekeeping } from './RoomHousekeeping';

/**
 * Schedules one check at each new request's deadline, so "expired" reaches the requester and
 * staff on time instead of at the room's next action (LLD SP-10). No polling: one timer per
 * request, on the instance that created it; lazy expiry covers instance loss.
 */
export class RequestExpiryWatcher implements RoomEventListener {
  constructor(
    private readonly housekeeping: RoomHousekeeping,
    private readonly scheduler: Scheduler,
    private readonly clock: Clock,
  ) {}

  onEvents(room: Room, events: readonly DomainEvent[]): void {
    for (const event of events) {
      if (event.type !== 'RequestCreated') {
        continue;
      }
      const request = room.pendingRequests().find((r) => r.id === event.requestId);
      if (request !== undefined) {
        const delayMs = Math.max(0, request.expiresAt - this.clock.now()) + DEADLINE_CHECK_SLACK_MS;
        this.scheduler.schedule(`request:${request.id}`, delayMs, () => this.housekeeping.sweep(room.id));
      }
    }
  }
}
