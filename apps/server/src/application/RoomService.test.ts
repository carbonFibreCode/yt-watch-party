import { describe, expect, it } from 'vitest';
import { GRACE_PERIOD_MS, REQUEST_TTL_MS } from '@watchparty/shared';
import { DomainError } from '../domain/DomainError';
import type { RoomSnapshot } from '../domain/snapshot';
import { InMemoryRoomRepository } from '../infrastructure/repositories/InMemoryRoomRepository';
import { RoomService } from './RoomService';
import { FakeClock, SeqIdGenerator } from './test/fakes';

const HOST = { userId: 'u-host', name: 'Hana' };
const GUEST = { userId: 'u-guest', name: 'Gus' };

/** Commits the first `conflicts` CAS attempts behind the caller's back, like another instance would. */
class ContendedRepository extends InMemoryRoomRepository {
  attempts = 0;

  constructor(private conflicts: number) {
    super();
  }

  override async compareAndSet(snapshot: RoomSnapshot, expectedVersion: number): Promise<boolean> {
    this.attempts += 1;
    if (this.conflicts > 0) {
      this.conflicts -= 1;
      const current = await this.load(snapshot.id);
      if (current !== null) {
        await super.compareAndSet({ ...current, version: current.version + 1 }, current.version);
      }
    }
    return super.compareAndSet(snapshot, expectedVersion);
  }
}

const setup = (repository = new InMemoryRoomRepository(), codes: string[] = []) => {
  const clock = new FakeClock();
  const service = new RoomService(repository, clock, new SeqIdGenerator(codes));
  return { clock, service, repository };
};

describe('RoomService', () => {
  describe('create', () => {
    it('persists a new room hosted by the creator', async () => {
      const { service, repository } = setup(undefined, ['K7M2QX']);
      const room = await service.create('Movie night', HOST);
      expect(room.id).toBe('K7M2QX');
      expect((await repository.load('K7M2QX'))?.hostId).toBe(HOST.userId);
    });

    it('cues an initial video paused', async () => {
      const { service, repository } = setup(undefined, ['K7M2QX']);
      const video = { id: 'dQw4w9WgXcQ', title: 'T', thumbnailUrl: 'x' };
      await service.create('Movie night', HOST, { video, startAt: 12 });
      expect((await repository.load('K7M2QX'))?.playback).toMatchObject({
        video,
        isPlaying: false,
        anchorPosition: 12,
      });
    });

    it('retries with a new code on collision', async () => {
      const { service } = setup(undefined, ['AAAAAA', 'AAAAAA', 'BBBBBB']);
      await service.create('First', HOST);
      expect((await service.create('Second', HOST)).id).toBe('BBBBBB');
    });

    it('gives up with CONFLICT when every code collides', async () => {
      const { service } = setup(
        undefined,
        Array.from({ length: 6 }, () => 'AAAAAA'),
      );
      await service.create('First', HOST);
      await expect(service.create('Second', HOST)).rejects.toEqual(new DomainError('CONFLICT'));
    });

    it('propagates unexpected storage errors', async () => {
      const failing = new InMemoryRoomRepository();
      failing.create = () => Promise.reject(new Error('disk on fire'));
      await expect(setup(failing).service.create('X', HOST)).rejects.toThrow('disk on fire');
    });
  });

  describe('read', () => {
    it('throws ROOM_NOT_FOUND for unknown rooms', async () => {
      await expect(setup().service.read('ZZZZZZ')).rejects.toEqual(new DomainError('ROOM_NOT_FOUND'));
    });
  });

  describe('mutate', () => {
    it('commits the change, bumps the version and returns the events', async () => {
      const { service, repository, clock } = setup(undefined, ['K7M2QX']);
      await service.create('Movie night', HOST);
      const { result, events } = await service.mutate('K7M2QX', (room, now) => room.join(GUEST, now));
      expect(result.isNew).toBe(true);
      expect(events.map((e) => e.type)).toEqual(['ParticipantJoined']);
      const stored = await repository.load('K7M2QX');
      expect(stored?.version).toBe(1);
      expect(stored?.members.members.find((m) => m.userId === GUEST.userId)?.joinedAt).toBe(clock.now());
    });

    it('retries on a CAS conflict and applies the change exactly once', async () => {
      const repository = new ContendedRepository(2);
      const { service } = setup(repository, ['K7M2QX']);
      await service.create('Movie night', HOST);
      let runs = 0;
      await service.mutate('K7M2QX', (room, now) => {
        runs += 1;
        room.join(GUEST, now);
      });
      expect(runs).toBe(3);
      expect(repository.attempts).toBe(3);
      expect((await repository.load('K7M2QX'))?.members.members).toHaveLength(2);
    });

    it('gives up with CONFLICT after the retry budget', async () => {
      const { service } = setup(new ContendedRepository(10), ['K7M2QX']);
      await service.create('Movie night', HOST);
      await expect(service.mutate('K7M2QX', () => undefined)).rejects.toEqual(new DomainError('CONFLICT'));
    });

    it('runs lazy housekeeping before the change: reaps expired members and requests', async () => {
      const { service, clock } = setup(undefined, ['K7M2QX']);
      await service.create('Movie night', HOST);
      await service.mutate('K7M2QX', (room, now) => {
        room.join(HOST, now);
        room.join(GUEST, now);
        room.createRequest(GUEST.userId, { type: 'play' }, 'r1', now);
        room.markAway(GUEST.userId, now);
      });
      clock.advance(Math.max(GRACE_PERIOD_MS, REQUEST_TTL_MS));
      const { events, room } = await service.mutate('K7M2QX', () => undefined);
      expect(room.participant(GUEST.userId)).toBeUndefined();
      expect(events.map((e) => e.type)).toEqual(['RequestResolved', 'ParticipantLeft']);
    });

    it('does not commit when the change throws', async () => {
      const { service, repository } = setup(undefined, ['K7M2QX']);
      await service.create('Movie night', HOST);
      await expect(
        service.mutate('K7M2QX', () => {
          throw new DomainError('FORBIDDEN');
        }),
      ).rejects.toEqual(new DomainError('FORBIDDEN'));
      expect((await repository.load('K7M2QX'))?.version).toBe(0);
    });

    it('serializes concurrent mutations of one room without conflicts', async () => {
      const repository = new ContendedRepository(0);
      const { service } = setup(repository, ['K7M2QX']);
      await service.create('Movie night', HOST);
      await Promise.all(
        ['a', 'b', 'c', 'd'].map((id) =>
          service.mutate('K7M2QX', (room, now) => room.join({ userId: id, name: id }, now)),
        ),
      );
      expect(repository.attempts).toBe(4);
      expect((await repository.load('K7M2QX'))?.version).toBe(4);
    });
  });
});
