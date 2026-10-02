import { PermissionPolicy } from '@watchparty/shared';
import type {
  ParticipantView,
  RoomCode,
  ServerEventName,
  ServerToClientEvents,
  UserId,
} from '@watchparty/shared';
import type { Broadcaster, Clock, Metrics } from '../../application/ports';
import { RoomPresenter } from '../../application/RoomPresenter';
import type { DomainEvent, DomainEventType } from '../../domain/events';
import type { Room } from '../../domain/Room';
import { ch } from './channels';
import type { IoServer } from './types';

/** Everything presenters need for one published batch; the participant list is built once. */
interface Batch {
  readonly room: Room;
  readonly now: number;
  participants(): ParticipantView[];
}

type Presenters = { [K in DomainEventType]: (event: DomainEvent<K>, batch: Batch) => void };

/** Events whose wire form is "current state": sending them twice in one batch is redundant. */
const STATE_EVENTS: ReadonlySet<DomainEventType> = new Set(['PlaybackChanged', 'QueueChanged']);

const makeBatch = (room: Room, now: number): Batch => {
  let participants: ParticipantView[] | undefined;
  return { room, now, participants: () => (participants ??= RoomPresenter.participants(room)) };
};

/**
 * Domain events → wire events and channel side effects (LLD SP-8). One presenter per event type
 * (Open/Closed); the table is typed so every domain event must have exactly one presenter.
 */
export class SocketBroadcaster implements Broadcaster {
  private readonly presenters: Presenters = {
    ParticipantJoined: (e, b) => {
      this.emitTo(ch.room(b.room.id), 'user_joined', {
        userId: e.userId,
        username: e.name,
        role: e.role,
        participants: b.participants(),
      });
    },
    ParticipantLeft: (e, b) => {
      this.emitTo(ch.room(b.room.id), 'user_left', {
        userId: e.userId,
        username: e.name,
        reason: e.reason,
        participants: b.participants(),
      });
    },
    PresenceChanged: (e, b) => {
      this.emitTo(ch.room(b.room.id), 'presence_changed', {
        userId: e.userId,
        presence: e.presence,
        participants: b.participants(),
      });
    },
    ParticipantRemoved: (e, b) => {
      const roomId = b.room.id;
      const userChannel = ch.user(roomId, e.userId);
      this.emitTo(userChannel, 'kicked', {
        roomId,
        reason: e.byRole === 'host' ? 'removed_by_host' : 'removed_by_moderator',
      });
      this.io.in(userChannel).socketsLeave([ch.room(roomId), ch.staff(roomId), userChannel]);
      this.emitTo(ch.room(roomId), 'participant_removed', {
        userId: e.userId,
        participants: b.participants(),
      });
    },
    RoleAssigned: (e, b) => {
      this.emitTo(ch.room(b.room.id), 'role_assigned', {
        userId: e.userId,
        username: e.name,
        role: e.role,
        participants: b.participants(),
      });
      this.syncStaffChannel(b.room, e.userId);
    },
    HostTransferred: (e, b) => {
      this.emitTo(ch.room(b.room.id), 'host_transferred', {
        fromUserId: e.fromUserId,
        toUserId: e.toUserId,
        reason: e.reason,
        participants: b.participants(),
      });
      this.syncStaffChannel(b.room, e.fromUserId);
      this.syncStaffChannel(b.room, e.toUserId);
    },
    PlaybackChanged: (_e, b) => {
      this.emitTo(ch.room(b.room.id), 'sync_state', RoomPresenter.playback(b.room, b.now));
    },
    QueueChanged: (_e, b) => {
      this.emitTo(ch.room(b.room.id), 'queue_updated', { queue: RoomPresenter.queue(b.room) });
    },
    RequestCreated: (e, b) => {
      const request = b.room.pendingRequests().find((r) => r.id === e.requestId);
      if (request !== undefined) {
        this.emitTo(ch.staff(b.room.id), 'action_requested', RoomPresenter.request(request));
      }
    },
    RequestResolved: (e, b) => {
      const roomId = b.room.id;
      this.emitTo([ch.user(roomId, e.requesterId), ch.staff(roomId)], 'request_resolved', {
        requestId: e.requestId,
        status: e.status,
        ...(e.resolvedBy === undefined ? {} : { resolvedBy: e.resolvedBy }),
      });
    },
  };

  constructor(
    private readonly io: IoServer,
    private readonly clock: Clock,
    private readonly metrics: Metrics,
  ) {}

  publish(room: Room, events: readonly DomainEvent[]): Promise<void> {
    const batch = makeBatch(room, this.clock.now());
    const sentState = new Set<DomainEventType>();
    for (const event of events) {
      if (STATE_EVENTS.has(event.type)) {
        if (sentState.has(event.type)) {
          continue;
        }
        sentState.add(event.type);
      }
      this.present(event, batch);
    }
    return Promise.resolve();
  }

  toRoom<E extends ServerEventName>(
    roomId: RoomCode,
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void {
    this.emitTo(ch.room(roomId), event, ...payload);
  }

  private present<K extends DomainEventType>(event: DomainEvent<K>, batch: Batch): void {
    this.presenters[event.type](event, batch);
  }

  /** The single place events leave the server, so every broadcast is counted. */
  private emitTo<E extends ServerEventName>(
    channels: string | string[],
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void {
    this.io.to(channels).emit(event, ...payload);
    this.metrics.eventBroadcast(event);
  }

  /**
   * Keeps the staff channel in line with the user's current role, on every instance. Newly staff
   * users get the pending requests replayed (clients de-duplicate by request id).
   */
  private syncStaffChannel(room: Room, userId: UserId): void {
    const member = room.participant(userId);
    const userChannel = ch.user(room.id, userId);
    if (member === undefined || !PermissionPolicy.isStaff(member.role)) {
      this.io.in(userChannel).socketsLeave(ch.staff(room.id));
      return;
    }
    this.io.in(userChannel).socketsJoin(ch.staff(room.id));
    for (const request of room.pendingRequests()) {
      this.emitTo(userChannel, 'action_requested', RoomPresenter.request(request));
    }
  }
}
