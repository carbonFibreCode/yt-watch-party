import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../application/test/fakes';
import { DomainError } from '../../domain/DomainError';
import { InMemoryRoomRepository } from './InMemoryRoomRepository';
import { SnapshotFlusher } from './SnapshotFlusher';
import { InMemoryArchive } from './test/InMemoryArchive';
import { describeRoomRepository } from './test/roomRepositoryContract';
import { roomSnapshot } from './test/snapshots';
import { TieredRoomRepository } from './TieredRoomRepository';

const tiered = (archive = new InMemoryArchive(), hot = new InMemoryRoomRepository()) => {
  const flusher = new SnapshotFlusher(archive, new RecordingLogger());
  return { archive, hot, flusher, repo: new TieredRoomRepository(hot, archive, flusher) };
};

describeRoomRepository('TieredRoomRepository (memory over in-memory archive)', () => tiered().repo);

describe('TieredRoomRepository', () => {
  it('writes through to the archive on create', async () => {
    const { repo, archive } = tiered();
    await repo.create(roomSnapshot());
    expect(await archive.load('K7M2QX')).not.toBeNull();
  });

  it('writes behind on commit, then the archive catches up on flush', async () => {
    const { repo, archive, flusher } = tiered();
    await repo.create(roomSnapshot());
    await repo.compareAndSet(roomSnapshot('K7M2QX', 1), 0);
    expect((await archive.load('K7M2QX'))?.version).toBe(0);
    await flusher.flush();
    expect((await archive.load('K7M2QX'))?.version).toBe(1);
  });

  it('reads through to the archive when the hot store lost the room (eviction/restart)', async () => {
    const archive = new InMemoryArchive();
    await archive.create(roomSnapshot('K7M2QX', 7));
    const { repo, hot } = tiered(archive);
    expect((await repo.load('K7M2QX'))?.version).toBe(7);
    expect((await hot.load('K7M2QX'))?.version).toBe(7);
  });

  it('prefers a not-yet-flushed snapshot over a stale archive copy', async () => {
    const archive = new InMemoryArchive();
    await archive.create(roomSnapshot('K7M2QX', 1));
    const first = tiered(archive);
    await first.repo.load('K7M2QX');
    await first.repo.compareAndSet(roomSnapshot('K7M2QX', 2), 1);
    // The hot store is lost before the flush (e.g. evicted); the flusher still knows v2.
    const second = new TieredRoomRepository(new InMemoryRoomRepository(), archive, first.flusher);
    expect((await second.load('K7M2QX'))?.version).toBe(2);
  });

  it('uses the hot copy when another caller seeded it first', async () => {
    const archive = new InMemoryArchive();
    await archive.create(roomSnapshot('K7M2QX', 1));
    const hot = new InMemoryRoomRepository();
    const { repo } = tiered(archive, hot);
    const originalLoad = hot.load.bind(hot);
    let calls = 0;
    hot.load = async (id) => {
      calls += 1;
      if (calls === 1) {
        await hot.create(roomSnapshot('K7M2QX', 5, 'raced'));
        return null;
      }
      return originalLoad(id);
    };
    expect((await repo.load('K7M2QX'))?.name).toBe('raced');
  });

  it('propagates unexpected seeding failures', async () => {
    const archive = new InMemoryArchive();
    await archive.create(roomSnapshot('K7M2QX', 1));
    const hot = new InMemoryRoomRepository();
    hot.create = () => Promise.reject(new Error('hot store down'));
    await expect(tiered(archive, hot).repo.load('K7M2QX')).rejects.toThrow('hot store down');
  });

  it('does not create in the hot store when the archive refuses the code', async () => {
    const { repo, hot, archive } = tiered();
    await archive.create(roomSnapshot());
    await expect(repo.create(roomSnapshot())).rejects.toEqual(new DomainError('CONFLICT'));
    expect(await hot.load('K7M2QX')).toBeNull();
  });
});
