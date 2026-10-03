import { CAS_MAX_RETRIES, ROOM_CODE_MAX_ATTEMPTS } from '@watchparty/shared';
import type { RoomCode, UserRef } from '@watchparty/shared';
import { DomainError } from '../domain/DomainError';
import type { DomainEvent } from '../domain/events';
import { Room } from '../domain/Room';
import type { RoomSnapshot } from '../domain/snapshot';
import { KeyedMutex } from './KeyedMutex';
import { noMetrics } from './noMetrics';
import type { Clock, IdGenerator, Metrics, RoomRepository } from './ports';
import type { ResolvedVideo } from './VideoResolver';

export interface MutationResult<T> {
  readonly result: T;
  readonly room: Room;
  readonly events: readonly DomainEvent[];
}

/**
 * Unit of Work for the Room aggregate (LLD SP-6). `mutate` is the only way room state changes:
 * load → housekeeping → mutate → compare-and-set → hand back the events.
 */
export class RoomService {
  constructor(
    private readonly repository: RoomRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly metrics: Metrics = noMetrics,
    private readonly locks: KeyedMutex = new KeyedMutex(),
  ) {}

  /**
   * Creates a room under a fresh code, retrying on the (rare) code collision. An initial video is
   * cued paused; creation events are discarded because nobody is connected yet.
   */
  async create(name: string, host: UserRef, initial?: ResolvedVideo): Promise<Room> {
    for (let attempt = 1; attempt <= ROOM_CODE_MAX_ATTEMPTS; attempt += 1) {
      const now = this.clock.now();
      const room = Room.create({ id: this.ids.roomCode(), name, host, now });
      if (initial !== undefined) {
        room.cueVideo(initial.video, initial.startAt, now);
        room.pullEvents();
      }
      try {
        await this.repository.create(room.toSnapshot());
        return room;
      } catch (error) {
        if (!(error instanceof DomainError && error.code === 'CONFLICT')) {
          throw error;
        }
      }
    }
    throw new DomainError('CONFLICT');
  }

  /** Read-only view of the current state; never persisted, so it skips housekeeping. */
  async read(id: RoomCode): Promise<Room> {
    return Room.fromSnapshot(await this.load(id));
  }

  /**
   * Runs `change` against the latest state and commits it atomically. `change` must be pure:
   * it may run more than once when another instance commits first.
   */
  async mutate<T>(id: RoomCode, change: (room: Room, now: number) => T): Promise<MutationResult<T>> {
    return this.locks.runExclusive(id, async () => {
      for (let attempt = 1; attempt <= CAS_MAX_RETRIES; attempt += 1) {
        const snapshot = await this.load(id);
        const room = Room.fromSnapshot(snapshot);
        const now = this.clock.now();
        room.reapAway(now);
        room.expireRequests(now);
        const result = change(room, now);
        const next = { ...room.toSnapshot(), version: snapshot.version + 1 };
        if (await this.repository.compareAndSet(next, snapshot.version)) {
          this.metrics.roomCommitted(attempt);
          return { result, room, events: room.pullEvents() };
        }
      }
      throw new DomainError('CONFLICT');
    });
  }

  private async load(id: RoomCode): Promise<RoomSnapshot> {
    const snapshot = await this.repository.load(id);
    if (snapshot === null) {
      throw new DomainError('ROOM_NOT_FOUND');
    }
    return snapshot;
  }
}
