import type {
  HostTransferReason,
  LeaveReason,
  Presence,
  RequestStatus,
  Role,
  UserId,
} from '@watchparty/shared';

/**
 * Facts produced by the Room aggregate (LLD SP-4). Drained by RoomService and translated into
 * wire events by the Broadcaster (LLD SP-8). Playback/queue events carry no data: presenters
 * read the current state, so a batch never broadcasts stale values.
 */
export type DomainEvent =
  | {
      readonly type: 'ParticipantJoined';
      readonly userId: UserId;
      readonly name: string;
      readonly role: Role;
    }
  | {
      readonly type: 'ParticipantLeft';
      readonly userId: UserId;
      readonly name: string;
      readonly reason: LeaveReason;
    }
  | { readonly type: 'PresenceChanged'; readonly userId: UserId; readonly presence: Presence }
  | {
      readonly type: 'ParticipantRemoved';
      readonly userId: UserId;
      readonly name: string;
      readonly byRole: Role;
    }
  | {
      readonly type: 'RoleAssigned';
      readonly userId: UserId;
      readonly name: string;
      readonly role: Role;
      readonly previousRole: Role;
    }
  | {
      readonly type: 'HostTransferred';
      readonly fromUserId: UserId;
      readonly toUserId: UserId;
      readonly reason: HostTransferReason;
    }
  | { readonly type: 'PlaybackChanged' }
  | { readonly type: 'QueueChanged' }
  | { readonly type: 'RequestCreated'; readonly requestId: string }
  | {
      readonly type: 'RequestResolved';
      readonly requestId: string;
      readonly requesterId: UserId;
      readonly status: RequestStatus;
      readonly resolvedBy?: UserId;
    };

export type DomainEventType = DomainEvent['type'];
