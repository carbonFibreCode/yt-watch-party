import type {
  ChatMessageView,
  RateRule,
  Role,
  RoomCode,
  RoomSummary,
  ServerEventName,
  ServerToClientEvents,
  UserId,
  UserRef,
  VideoId,
} from '@watchparty/shared';
import type { DomainEvent } from '../domain/events';
import type { Room } from '../domain/Room';
import type { RoomSnapshot } from '../domain/snapshot';
import type { VideoRef } from '../domain/VideoRef';

/**
 * Every boundary the application layer depends on (LLD §1.1 DIP, §1.3 Ports & Adapters).
 * Implementations live in infrastructure/ and are wired only in main.ts.
 */

// ---------- time & identity ----------

export interface Clock {
  now(): number;
}

export interface IdGenerator {
  /** Opaque unique id for requests, queue items and chat messages. */
  next(): string;
  /** Human-friendly room code from ROOM_CODE_ALPHABET. */
  roomCode(): RoomCode;
}

export interface AuthUser extends UserRef {
  readonly isAnonymous: boolean;
}

export type RequestHeaders = Readonly<Record<string, string | string[] | undefined>>;

export interface SessionResolver {
  resolve(headers: RequestHeaders): Promise<AuthUser | null>;
}

// ---------- persistence ----------

export interface RoomRepository {
  /** Throws DomainError('CONFLICT') when the id is already taken. */
  create(snapshot: RoomSnapshot): Promise<void>;
  load(id: RoomCode): Promise<RoomSnapshot | null>;
  /** Stores `snapshot` only if the stored version still equals `expectedVersion`. */
  compareAndSet(snapshot: RoomSnapshot, expectedVersion: number): Promise<boolean>;
}

export interface ChatMessage extends ChatMessageView {
  readonly roomId: RoomCode;
}

export interface ChatRepository {
  append(message: ChatMessage): Promise<void>;
  /** The latest `limit` messages, oldest first. */
  recent(roomId: RoomCode, limit: number): Promise<readonly ChatMessage[]>;
}

export interface MembershipEntry {
  readonly roomId: RoomCode;
  readonly userId: UserId;
  readonly roomName: string;
  readonly role: Role;
  readonly at: number;
}

export interface MembershipRepository {
  /** Records that a user (re)joined a room, for the "recent rooms" list. */
  touch(entry: MembershipEntry): Promise<void>;
  recentForUser(userId: UserId, limit: number): Promise<readonly RoomSummary[]>;
  /** Moves memberships from an anonymous account to the account it was linked to. */
  reassign(fromUserId: UserId, toUserId: UserId): Promise<void>;
}

// ---------- external services ----------

export interface VideoMetadataProvider {
  /** Throws DomainError('INVALID_VIDEO' | 'EMBED_DISABLED'); degrades gracefully on network errors. */
  lookup(videoId: VideoId): Promise<VideoRef>;
}

export interface RateLimiter {
  /** Throws DomainError('RATE_LIMITED') when the bucket for `key` under `rule` is empty. */
  consume(rule: RateRule, key: string): Promise<void>;
}

// ---------- realtime ----------

/** One connected socket's view of itself; implemented over Socket.IO in infrastructure. */
export interface RealtimeSession {
  readonly user: AuthUser;
  readonly roomId: RoomCode | null;
  /** Joins the room's channels (and the staff channel for staff roles). */
  attach(roomId: RoomCode, role: Role): Promise<void>;
  detach(): Promise<void>;
}

export interface PresenceProbe {
  /** Sockets of `userId` currently attached to `roomId`, across all server instances. */
  countSockets(roomId: RoomCode, userId: UserId): Promise<number>;
}

export interface Broadcaster {
  /** Translates domain events into wire events and side effects (LLD SP-8). */
  publish(room: Room, events: readonly DomainEvent[]): Promise<void>;
  /** Side-channel emits that do not originate in the aggregate (chat, reactions). */
  toRoom<E extends ServerEventName>(
    roomId: RoomCode,
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void;
}

/** Deferred work keyed for de-duplication: scheduling an existing key replaces its timer. */
export interface Scheduler {
  schedule(key: string, delayMs: number, task: () => Promise<void>): void;
  cancelAll(): void;
}

// ---------- observability ----------

export interface Logger {
  debug(fields: object, message: string): void;
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
  error(fields: object, message: string): void;
  child(bindings: object): Logger;
}
