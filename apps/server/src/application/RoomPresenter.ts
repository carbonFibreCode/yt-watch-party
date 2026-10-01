import { PermissionPolicy } from '@watchparty/shared';
import type {
  ChatMessageView,
  ParticipantView,
  PlaybackView,
  QueueItemView,
  RequestActionView,
  RequestView,
  RoomView,
  UserId,
} from '@watchparty/shared';
import { DomainError } from '../domain/DomainError';
import type { Participant } from '../domain/Participant';
import type { ActionRequest, RequestedAction } from '../domain/RequestBook';
import type { Room } from '../domain/Room';
import type { QueueItem } from '../domain/VideoQueue';
import type { ChatMessage } from './ports';

const actionView = (action: RequestedAction): RequestActionView => {
  switch (action.type) {
    case 'play':
    case 'pause':
      return { type: action.type };
    case 'seek':
      return { type: 'seek', time: action.time };
    case 'change_video':
    case 'queue_add':
      return { type: action.type, video: action.video };
  }
};

/** Domain → wire read models (LLD §1.3 Presenter). Hides bans, role memory and internals. */
export const RoomPresenter = {
  participant: (p: Participant): ParticipantView => ({
    userId: p.userId,
    name: p.name,
    role: p.role,
    presence: p.presence,
    joinedAt: p.joinedAt,
  }),

  participants: (room: Room): ParticipantView[] => room.participants().map(RoomPresenter.participant),

  playback: (room: Room, now: number): PlaybackView => {
    const playback = room.playback;
    return {
      videoId: playback.video?.id ?? null,
      video: playback.video,
      playState: playback.playState,
      currentTime: playback.positionAt(now),
      serverTime: now,
      duration: playback.duration,
      rev: playback.rev,
    };
  },

  queueItem: (item: QueueItem): QueueItemView => ({ id: item.id, video: item.video, addedBy: item.addedBy }),

  queue: (room: Room): QueueItemView[] => room.queueItems().map(RoomPresenter.queueItem),

  request: (request: ActionRequest): RequestView => ({
    id: request.id,
    requester: request.requester,
    action: actionView(request.action),
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
  }),

  /** Full state for one user; pending requests are only included for staff. */
  roomView: (room: Room, selfId: UserId, now: number): RoomView => {
    const self = room.participant(selfId);
    if (self === undefined) {
      throw new DomainError('NOT_IN_ROOM');
    }
    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      self: RoomPresenter.participant(self),
      participants: RoomPresenter.participants(room),
      playback: RoomPresenter.playback(room, now),
      queue: RoomPresenter.queue(room),
      pendingRequests: PermissionPolicy.isStaff(self.role)
        ? room.pendingRequests().map(RoomPresenter.request)
        : [],
    };
  },

  chatMessage: ({ id, user, text, createdAt }: ChatMessage): ChatMessageView => ({
    id,
    user,
    text,
    createdAt,
  }),
} as const;
