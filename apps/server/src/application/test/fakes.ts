import { ROOM_CODE_ALPHABET, youtubeThumbnailUrl } from '@watchparty/shared';
import type {
  ErrorCode,
  RoomCode,
  ServerEventName,
  ServerToClientEvents,
  UserId,
  VideoId,
} from '@watchparty/shared';
import { DomainError } from '../../domain/DomainError';
import type { DomainEvent } from '../../domain/events';
import type { Room } from '../../domain/Room';
import type { VideoRef } from '../../domain/VideoRef';
import type {
  AuthUser,
  Broadcaster,
  Clock,
  IdGenerator,
  Logger,
  PresenceProbe,
  RealtimeSession,
  VideoMetadataProvider,
} from '../ports';

export const T0 = 1_700_000_000_000;

export class FakeClock implements Clock {
  constructor(public current: number = T0) {}

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

export class SeqIdGenerator implements IdGenerator {
  private counter = 0;

  constructor(private readonly codes: RoomCode[] = []) {}

  next(): string {
    this.counter += 1;
    return `id-${String(this.counter)}`;
  }

  roomCode(): RoomCode {
    this.counter += 1;
    return (
      this.codes.shift() ?? `HARN${ROOM_CODE_ALPHABET.charAt(this.counter % ROOM_CODE_ALPHABET.length)}2`
    );
  }
}

/** Resolves any id to a video; specific ids can be made to fail, and a hook runs on each lookup. */
export class StubVideoMetadataProvider implements VideoMetadataProvider {
  readonly failures = new Map<VideoId, ErrorCode>();
  /** Runs (and is awaited) during each lookup, i.e. between authorization and commit. */
  onLookup: (videoId: VideoId) => Promise<unknown> | undefined = () => undefined;

  async lookup(videoId: VideoId): Promise<VideoRef> {
    await this.onLookup(videoId);
    const failure = this.failures.get(videoId);
    if (failure !== undefined) {
      throw new DomainError(failure);
    }
    return { id: videoId, title: `Video ${videoId}`, thumbnailUrl: youtubeThumbnailUrl(videoId) };
  }
}

export interface SentEvent {
  readonly roomId: RoomCode;
  readonly event: ServerEventName;
  readonly payload: unknown;
}

export class RecordingBroadcaster implements Broadcaster {
  readonly published: { roomId: RoomCode; events: readonly DomainEvent[] }[] = [];
  readonly sent: SentEvent[] = [];

  publish(room: Room, events: readonly DomainEvent[]): Promise<void> {
    this.published.push({ roomId: room.id, events });
    return Promise.resolve();
  }

  toRoom<E extends ServerEventName>(
    roomId: RoomCode,
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void {
    this.sent.push({ roomId, event, payload: payload[0] });
  }

  eventTypes(): string[] {
    return this.published.flatMap((p) => p.events.map((e) => e.type));
  }

  clear(): void {
    this.published.length = 0;
    this.sent.length = 0;
  }
}

export class FakeSession implements RealtimeSession {
  roomId: RoomCode | null = null;
  attachedRole: string | null = null;
  detachCount = 0;

  constructor(readonly user: AuthUser) {}

  attach(roomId: RoomCode, role: string): Promise<void> {
    this.roomId = roomId;
    this.attachedRole = role;
    return Promise.resolve();
  }

  detach(): Promise<void> {
    this.roomId = null;
    this.attachedRole = null;
    this.detachCount += 1;
    return Promise.resolve();
  }
}

export class FakePresenceProbe implements PresenceProbe {
  private readonly counts = new Map<string, number>();

  set(roomId: RoomCode, userId: UserId, count: number): void {
    this.counts.set(`${roomId}:${userId}`, count);
  }

  countSockets(roomId: RoomCode, userId: UserId): Promise<number> {
    return Promise.resolve(this.counts.get(`${roomId}:${userId}`) ?? 0);
  }
}

export interface LogEntry {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly fields: object;
  readonly message: string;
}

export class RecordingLogger implements Logger {
  constructor(readonly entries: LogEntry[] = []) {}

  debug(fields: object, message: string): void {
    this.entries.push({ level: 'debug', fields, message });
  }

  info(fields: object, message: string): void {
    this.entries.push({ level: 'info', fields, message });
  }

  warn(fields: object, message: string): void {
    this.entries.push({ level: 'warn', fields, message });
  }

  error(fields: object, message: string): void {
    this.entries.push({ level: 'error', fields, message });
  }

  child(): Logger {
    return this;
  }
}

export const authUser = (userId: string, name: string = userId): AuthUser => ({
  userId,
  name,
  isAnonymous: true,
});

/** Scheduler whose tasks run only when the test says so. */
export class ManualScheduler {
  readonly tasks = new Map<string, { delayMs: number; task: () => Promise<void> }>();

  schedule(key: string, delayMs: number, task: () => Promise<void>): void {
    this.tasks.set(key, { delayMs, task });
  }

  cancelAll(): void {
    this.tasks.clear();
  }

  async runAll(): Promise<void> {
    const tasks = [...this.tasks.values()];
    this.tasks.clear();
    for (const { task } of tasks) {
      await task();
    }
  }
}
