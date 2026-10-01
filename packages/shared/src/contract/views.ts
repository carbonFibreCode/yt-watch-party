import type { ReactionEmoji, Role, RoomCode, UserId, VideoId } from './primitives';

/** Read models sent from server to client (LLD SP-1). Produced only by the server's RoomPresenter. */

export type Presence = 'online' | 'away';
export type PlayState = 'playing' | 'paused' | 'idle';

export interface VideoView {
  readonly id: VideoId;
  readonly title: string;
  readonly thumbnailUrl: string;
}

export interface UserRef {
  readonly userId: UserId;
  readonly name: string;
}

export interface ParticipantView extends UserRef {
  readonly role: Role;
  readonly presence: Presence;
  readonly joinedAt: number;
}

/** Wire form of the brief's `sync_state`: `currentTime` is the position at `serverTime`. */
export interface PlaybackView {
  readonly videoId: VideoId | null;
  readonly video: VideoView | null;
  readonly playState: PlayState;
  readonly currentTime: number;
  readonly serverTime: number;
  readonly duration: number | null;
  readonly rev: number;
}

export interface QueueItemView {
  readonly id: string;
  readonly video: VideoView;
  readonly addedBy: UserRef;
}

export type RequestActionView =
  | { readonly type: 'play' }
  | { readonly type: 'pause' }
  | { readonly type: 'seek'; readonly time: number }
  | { readonly type: 'change_video'; readonly video: VideoView }
  | { readonly type: 'queue_add'; readonly video: VideoView };

export interface RequestView {
  readonly id: string;
  readonly requester: UserRef;
  readonly action: RequestActionView;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface RoomView {
  readonly id: RoomCode;
  readonly name: string;
  readonly hostId: UserId;
  readonly self: ParticipantView;
  readonly participants: readonly ParticipantView[];
  readonly playback: PlaybackView;
  readonly queue: readonly QueueItemView[];
  /** Populated for staff (host/moderator) only; empty for everyone else. */
  readonly pendingRequests: readonly RequestView[];
}

export interface ChatMessageView {
  readonly id: string;
  readonly user: UserRef & { readonly role: Role };
  readonly text: string;
  readonly createdAt: number;
}

export interface ReactionView extends UserRef {
  readonly id: string;
  readonly emoji: ReactionEmoji;
  readonly videoTime: number;
  readonly at: number;
}

export type RequestStatus = 'approved' | 'rejected' | 'expired';
export type HostTransferReason = 'manual' | 'succession';
export type LeaveReason = 'left' | 'timeout';
export type KickReason = 'removed_by_host' | 'removed_by_moderator';
