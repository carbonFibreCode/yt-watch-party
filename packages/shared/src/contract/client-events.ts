import { z } from 'zod';
import {
  AssignableRole,
  ChatText,
  DisplayName,
  EntityId,
  ReactionEmoji,
  Revision,
  RoomCode,
  Seconds,
  UserId,
  VideoId,
  VideoUrl,
} from './primitives';
import type { ChatMessageView, RoomView } from './views';

const Empty = z.strictObject({});

const play = Empty;
const pause = Empty;
const seek = z.strictObject({ time: Seconds });
const changeVideo = z.strictObject({ url: VideoUrl });
const queueAdd = z.strictObject({ url: VideoUrl });

/**
 * A playback change a participant may ask staff to approve (LLD SP-10).
 * Each branch reuses the payload shape of the command it stands for (DRY).
 */
export const RequestableAction = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('play'), ...play.shape }),
  z.strictObject({ type: z.literal('pause'), ...pause.shape }),
  z.strictObject({ type: z.literal('seek'), ...seek.shape }),
  z.strictObject({ type: z.literal('change_video'), ...changeVideo.shape }),
  z.strictObject({ type: z.literal('queue_add'), ...queueAdd.shape }),
]);
export type RequestableAction = z.infer<typeof RequestableAction>;
export type RequestableActionType = RequestableAction['type'];

/** The single list of client → server intents (LLD SP-1). Brief-mandated names are kept verbatim. */
export const ClientEventSchemas = {
  join_room: z.strictObject({ roomId: RoomCode, displayName: DisplayName.optional() }),
  leave_room: z.strictObject({ roomId: RoomCode }),
  play,
  pause,
  seek,
  change_video: changeVideo,
  assign_role: z.strictObject({ userId: UserId, role: AssignableRole }),
  remove_participant: z.strictObject({ userId: UserId }),
  transfer_host: z.strictObject({ userId: UserId }),
  queue_add: queueAdd,
  queue_remove: z.strictObject({ itemId: EntityId }),
  request_action: z.strictObject({ action: RequestableAction }),
  resolve_request: z.strictObject({ requestId: EntityId, approve: z.boolean() }),
  chat_message: z.strictObject({ text: ChatText }),
  reaction: z.strictObject({ emoji: ReactionEmoji, videoTime: Seconds }),
  report_duration: z.strictObject({ videoId: VideoId, duration: Seconds.min(1) }),
  video_ended: z.strictObject({ videoId: VideoId, rev: Revision }),
  /** JSON-RPC envelope produced by the `timesync` library; extra fields are tolerated. */
  timesync: z.looseObject({ id: z.union([z.number(), z.string()]), method: z.literal('timesync') }),
} as const;

export type ClientEventName = keyof typeof ClientEventSchemas;
export type ClientPayload<E extends ClientEventName> = z.infer<(typeof ClientEventSchemas)[E]>;

export const CLIENT_EVENT_NAMES = Object.keys(ClientEventSchemas) as readonly ClientEventName[];

// ---------- ack data per event ----------

export type EmptyAck = Record<string, never>;

export interface JoinRoomAck {
  readonly room: RoomView;
  readonly chatHistory: readonly ChatMessageView[];
}

export interface RequestActionAck {
  readonly requestId: string;
  readonly expiresAt: number;
}

export interface TimesyncAck {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly result: number;
}

export interface AckData {
  join_room: JoinRoomAck;
  leave_room: EmptyAck;
  play: EmptyAck;
  pause: EmptyAck;
  seek: EmptyAck;
  change_video: EmptyAck;
  assign_role: EmptyAck;
  remove_participant: EmptyAck;
  transfer_host: EmptyAck;
  queue_add: EmptyAck;
  queue_remove: EmptyAck;
  request_action: RequestActionAck;
  resolve_request: EmptyAck;
  chat_message: EmptyAck;
  reaction: EmptyAck;
  report_duration: EmptyAck;
  video_ended: EmptyAck;
  timesync: TimesyncAck;
}
