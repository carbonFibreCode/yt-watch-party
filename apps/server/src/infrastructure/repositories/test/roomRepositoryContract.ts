import { describe, expect, it } from 'vitest';
import type { RoomRepository } from '../../../application/ports';
import { DomainError } from '../../../domain/DomainError';
import { Room } from '../../../domain/Room';
import type { RoomSnapshot } from '../../../domain/snapshot';

const T0 = 1_700_000_000_000;

const snapshot = (id = 'K7M2QX'): RoomSnapshot =>
  Room.create({ id, name: 'Contract room', host: { userId: 'u-host', name: 'Hana' }, now: T0 }).toSnapshot();

/**
 * Behavior every RoomRepository must have. Each implementation's test
 * file calls this with a factory for a fresh, empty store.
 */
export const describeRoomRepository = (
  name: string,
  factory: () => Promise<RoomRepository> | RoomRepository,
) => {
  describe(`RoomRepository contract: ${name}`, () => {
    it('returns null for an unknown room', async () => {
      const repo = await factory();
      expect(await repo.load('ZZZZZZ')).toBeNull();
    });

    it('creates and loads a room', async () => {
      const repo = await factory();
      await repo.create(snapshot());
      expect(await repo.load('K7M2QX')).toEqual(snapshot());
    });

    it('rejects creating a room whose code is taken', async () => {
      const repo = await factory();
      await repo.create(snapshot());
      await expect(repo.create(snapshot())).rejects.toEqual(new DomainError('CONFLICT'));
    });

    it('commits when the expected version matches', async () => {
      const repo = await factory();
      await repo.create(snapshot());
      const next = { ...snapshot(), name: 'Renamed', version: 1 };
      expect(await repo.compareAndSet(next, 0)).toBe(true);
      expect(await repo.load('K7M2QX')).toEqual(next);
    });

    it('refuses a stale expected version and keeps the stored state', async () => {
      const repo = await factory();
      await repo.create(snapshot());
      await repo.compareAndSet({ ...snapshot(), version: 1 }, 0);
      expect(await repo.compareAndSet({ ...snapshot(), name: 'Lost update', version: 1 }, 0)).toBe(false);
      expect((await repo.load('K7M2QX'))?.name).toBe('Contract room');
    });

    it('refuses compare-and-set for a room that does not exist', async () => {
      const repo = await factory();
      expect(await repo.compareAndSet({ ...snapshot(), version: 1 }, 0)).toBe(false);
    });

    it('never hands out aliases of stored state', async () => {
      const repo = await factory();
      await repo.create(snapshot());
      const loaded = await repo.load('K7M2QX');
      (loaded?.members.bans as string[] | undefined)?.push('mutated');
      expect((await repo.load('K7M2QX'))?.members.bans).toEqual([]);
    });

    it('keeps rooms independent', async () => {
      const repo = await factory();
      await repo.create(snapshot('AAAAAA'));
      await repo.create(snapshot('BBBBBB'));
      await repo.compareAndSet({ ...snapshot('AAAAAA'), version: 1 }, 0);
      expect((await repo.load('BBBBBB'))?.version).toBe(0);
    });
  });
};
