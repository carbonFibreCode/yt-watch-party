import type { Role, RoomCode, UserId } from './primitives';
import type {
  ChatMessageView,
  HostTransferReason,
  KickReason,
  LeaveReason,
  ParticipantView,
  PlaybackView,
  Presence,
  QueueItemView,
  ReactionView,
  RequestStatus,
  RequestView,
} from './views';

/** Membership events carry the full participant list, as the brief specifies. */
interface WithParticipants {
  readonly participants: readonly ParticipantView[];
}

export interface UserJoinedPayload extends WithParticipants {
  readonly userId: UserId;
  readonly username: string;
  readonly role: Role;
}

export interface UserLeftPayload extends WithParticipants {
  readonly userId: UserId;
  readonly username: string;
  readonly reason: LeaveReason;
}

export interface PresenceChangedPayload extends WithParticipants {
  readonly userId: UserId;
  readonly presence: Presence;
}

export interface RoleAssignedPayload extends WithParticipants {
  readonly userId: UserId;
  readonly username: string;
  readonly role: Role;
}

export interface HostTransferredPayload extends WithParticipants {
  readonly fromUserId: UserId;
  readonly toUserId: UserId;
  readonly reason: HostTransferReason;
}

export interface ParticipantRemovedPayload extends WithParticipants {
  readonly userId: UserId;
}

export interface KickedPayload {
  readonly roomId: RoomCode;
  readonly reason: KickReason;
}

export interface QueueUpdatedPayload {
  readonly queue: readonly QueueItemView[];
}

export interface RequestResolvedPayload {
  readonly requestId: string;
  readonly status: RequestStatus;
  readonly resolvedBy?: UserId;
}

/** Server → client events (LLD SP-1, SP-8). */
export interface ServerToClientEvents {
  sync_state: (payload: PlaybackView) => void;
  user_joined: (payload: UserJoinedPayload) => void;
  user_left: (payload: UserLeftPayload) => void;
  presence_changed: (payload: PresenceChangedPayload) => void;
  role_assigned: (payload: RoleAssignedPayload) => void;
  host_transferred: (payload: HostTransferredPayload) => void;
  participant_removed: (payload: ParticipantRemovedPayload) => void;
  kicked: (payload: KickedPayload) => void;
  queue_updated: (payload: QueueUpdatedPayload) => void;
  action_requested: (payload: RequestView) => void;
  request_resolved: (payload: RequestResolvedPayload) => void;
  chat_message: (payload: ChatMessageView) => void;
  reaction: (payload: ReactionView) => void;
}

export type ServerEventName = keyof ServerToClientEvents;
