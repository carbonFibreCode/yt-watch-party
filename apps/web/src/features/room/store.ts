import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { CHAT_RENDER_LIMIT, REACTION_HISTORY_LIMIT } from '@watchparty/shared';
import type {
  ChatMessageView,
  ErrorCode,
  JoinRoomAck,
  ParticipantView,
  PlaybackView,
  QueueItemView,
  ReactionView,
  RequestView,
  RoomCode,
  UserId,
} from '@watchparty/shared';

export type ChatEntry =
  | ({ readonly kind: 'message' } & ChatMessageView)
  | { readonly kind: 'system'; readonly id: string; readonly text: string; readonly createdAt: number };

export type RoomStatus = 'connecting' | 'joined' | 'failed' | 'kicked';

export interface RoomData {
  readonly status: RoomStatus;
  readonly failure: ErrorCode | null;
  /** Transport state, independent of membership: a blip shows "reconnecting" without leaving. */
  readonly connection: 'online' | 'reconnecting';
  readonly roomId: RoomCode | null;
  readonly name: string;
  readonly hostId: UserId | null;
  readonly selfId: UserId | null;
  readonly participants: readonly ParticipantView[];
  readonly playback: PlaybackView | null;
  readonly queue: readonly QueueItemView[];
  readonly requests: readonly RequestView[];
  /** Ids of requests this user sent and is still waiting on. */
  readonly myRequests: readonly string[];
  readonly chat: readonly ChatEntry[];
  /** Reactions on the current video (reset when the video changes). */
  readonly reactions: readonly ReactionView[];
  /** Whether the chat is on screen; messages from others arriving while it is not count as unread. */
  readonly chatOpen: boolean;
  readonly unreadChat: number;
}

export interface RoomActions {
  hydrate(ack: JoinRoomAck): void;
  fail(code: ErrorCode): void;
  kicked(): void;
  setConnection(connection: RoomData['connection']): void;
  setParticipants(participants: readonly ParticipantView[]): void;
  setHost(hostId: UserId): void;
  applyPlayback(playback: PlaybackView): void;
  setQueue(queue: readonly QueueItemView[]): void;
  addRequest(request: RequestView): void;
  removeRequest(requestId: string): void;
  trackMyRequest(requestId: string): void;
  untrackMyRequest(requestId: string): void;
  addChat(message: ChatMessageView): void;
  addSystem(text: string, at: number): void;
  addReaction(reaction: ReactionView): void;
  setChatOpen(open: boolean): void;
}

export type RoomState = RoomData & RoomActions;
export type RoomStore = StoreApi<RoomState>;

const INITIAL: RoomData = {
  status: 'connecting',
  failure: null,
  connection: 'online',
  roomId: null,
  name: '',
  hostId: null,
  selfId: null,
  participants: [],
  playback: null,
  queue: [],
  requests: [],
  myRequests: [],
  chat: [],
  reactions: [],
  chatOpen: false,
  unreadChat: 0,
};

const capped = (entries: readonly ChatEntry[]): readonly ChatEntry[] =>
  entries.length > CHAT_RENDER_LIMIT ? entries.slice(entries.length - CHAT_RENDER_LIMIT) : entries;

let systemSequence = 0;

/** Room state fed by socket events (LLD SP-14). One store per room visit: no stale state between rooms. */
export const createRoomStore = (): RoomStore =>
  createStore<RoomState>()((set) => ({
    ...INITIAL,
    hydrate: ({ room, chatHistory }) => {
      set({
        status: 'joined',
        failure: null,
        roomId: room.id,
        name: room.name,
        hostId: room.hostId,
        selfId: room.self.userId,
        participants: room.participants,
        playback: room.playback,
        queue: room.queue,
        requests: room.pendingRequests,
        chat: capped(chatHistory.map((m) => ({ kind: 'message', ...m }))),
      });
    },
    fail: (code) => {
      set({ status: 'failed', failure: code });
    },
    kicked: () => {
      set({ status: 'kicked' });
    },
    setConnection: (connection) => {
      set({ connection });
    },
    setParticipants: (participants) => {
      set({ participants });
    },
    setHost: (hostId) => {
      set({ hostId });
    },
    /** Ignores out-of-order states; a different video also clears the previous video's reactions. */
    applyPlayback: (playback) => {
      set((s) => {
        if (s.playback !== null && playback.rev <= s.playback.rev) {
          return s;
        }
        return s.playback?.videoId === playback.videoId ? { playback } : { playback, reactions: [] };
      });
    },
    setQueue: (queue) => {
      set({ queue });
    },
    /** De-duplicated by id: staff may receive the same request again when (re)promoted. */
    addRequest: (request) => {
      set((s) => ({ requests: [...s.requests.filter((r) => r.id !== request.id), request] }));
    },
    removeRequest: (requestId) => {
      set((s) => ({ requests: s.requests.filter((r) => r.id !== requestId) }));
    },
    trackMyRequest: (requestId) => {
      set((s) => (s.myRequests.includes(requestId) ? s : { myRequests: [...s.myRequests, requestId] }));
    },
    untrackMyRequest: (requestId) => {
      set((s) => ({ myRequests: s.myRequests.filter((id) => id !== requestId) }));
    },
    addChat: (message) => {
      set((s) => {
        if (s.chat.some((e) => e.id === message.id)) {
          return s;
        }
        const unread = !s.chatOpen && message.user.userId !== s.selfId;
        return {
          chat: capped([...s.chat, { kind: 'message', ...message }]),
          unreadChat: unread ? s.unreadChat + 1 : s.unreadChat,
        };
      });
    },
    addReaction: (reaction) => {
      set((s) => ({ reactions: [...s.reactions, reaction].slice(-REACTION_HISTORY_LIMIT) }));
    },
    setChatOpen: (open) => {
      set({ chatOpen: open, ...(open ? { unreadChat: 0 } : {}) });
    },
    addSystem: (text, at) => {
      systemSequence += 1;
      set((s) => ({
        chat: capped([
          ...s.chat,
          { kind: 'system', id: `system-${String(systemSequence)}`, text, createdAt: at },
        ]),
      }));
    },
  }));

// ---------- selectors (subscribe with these, never to the whole store: rules.md §9.3) ----------

export const selectSelf = (s: RoomData): ParticipantView | undefined =>
  s.participants.find((p) => p.userId === s.selfId);

export const selectIsSelf =
  (userId: UserId) =>
  (s: RoomData): boolean =>
    s.selfId === userId;
