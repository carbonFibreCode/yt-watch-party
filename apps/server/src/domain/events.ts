import type {
  HostTransferReason,
  LeaveReason,
  Presence,
  RequestStatus,
  Role,
  UserId,
} from '@watchparty/shared';

/**
 * Facts produced by the Room aggregate (LLD SP-4), drained by RoomService and translated into
 * wire events by the Broadcaster (LLD SP-8). Playback/queue events carry no data: presenters
 * read the current state, so a batch never broadcasts stale values.
 */
export interface DomainEventMap {
  ParticipantJoined: { readonly userId: UserId; readonly name: string; readonly role: Role };
  ParticipantLeft: { readonly userId: UserId; readonly name: string; readonly reason: LeaveReason };
  PresenceChanged: { readonly userId: UserId; readonly presence: Presence };
  ParticipantRemoved: { readonly userId: UserId; readonly name: string; readonly byRole: Role };
  RoleAssigned: {
    readonly userId: UserId;
    readonly name: string;
    readonly role: Role;
    readonly previousRole: Role;
  };
  HostTransferred: {
    readonly fromUserId: UserId;
    readonly toUserId: UserId;
    readonly reason: HostTransferReason;
  };
  PlaybackChanged: object;
  QueueChanged: object;
  RequestCreated: { readonly requestId: string };
  RequestResolved: {
    readonly requestId: string;
    readonly requesterId: UserId;
    readonly status: RequestStatus;
    readonly resolvedBy?: UserId;
  };
}

export type DomainEventType = keyof DomainEventMap;

/**
 * Written as a distributed mapped type so a handler table keyed by `type` can be invoked with
 * full type safety (TypeScript correlated unions): `table[event.type](event)`.
 */
export type DomainEvent<K extends DomainEventType = DomainEventType> = {
  [T in K]: { readonly type: T } & DomainEventMap[T];
}[K];
