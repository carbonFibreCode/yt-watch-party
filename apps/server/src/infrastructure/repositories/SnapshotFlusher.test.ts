import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordingLogger } from '../../application/test/fakes';
import { SnapshotFlusher } from './SnapshotFlusher';
import { InMemoryArchive } from './test/InMemoryArchive';
import { roomSnapshot } from './test/snapshots';

const setup = async () => {
  const archive = new InMemoryArchive();
  await archive.create(roomSnapshot('K7M2QX', 0));
  const logger = new RecordingLogger();
  return { archive, logger, flusher: new SnapshotFlusher(archive, logger, 1_000) };
};

describe('SnapshotFlusher', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps only the newest dirty snapshot per room and writes it on flush', async () => {
    const { archive, flusher } = await setup();
    flusher.markDirty(roomSnapshot('K7M2QX', 3));
    flusher.markDirty(roomSnapshot('K7M2QX', 2));
    expect(flusher.pending('K7M2QX')?.version).toBe(3);
    await flusher.flush();
    expect((await archive.load('K7M2QX'))?.version).toBe(3);
    expect(archive.saves).toBe(1);
    expect(flusher.pending('K7M2QX')).toBeUndefined();
  });

  it('re-queues a snapshot whose write failed, and logs it', async () => {
    const { archive, flusher, logger } = await setup();
    archive.failNext = 1;
    flusher.markDirty(roomSnapshot('K7M2QX', 1));
    await flusher.flush();
    expect(flusher.pending('K7M2QX')?.version).toBe(1);
    expect(logger.entries[0]).toMatchObject({ level: 'error', fields: { roomId: 'K7M2QX' } });
    await flusher.flush();
    expect((await archive.load('K7M2QX'))?.version).toBe(1);
  });

  it('reports in-flight snapshots as pending until they are durable', async () => {
    const { archive, flusher } = await setup();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const save = archive.saveIfNewer.bind(archive);
    archive.saveIfNewer = async (s) => {
      await blocked;
      await save(s);
    };
    flusher.markDirty(roomSnapshot('K7M2QX', 4));
    const flushing = flusher.flush();
    expect(flusher.pending('K7M2QX')?.version).toBe(4);
    expect(flusher.flush()).toBe(flushing);
    release();
    await flushing;
    expect(flusher.pending('K7M2QX')).toBeUndefined();
  });

  it('flushes on an interval once started, and everything on stop', async () => {
    vi.useFakeTimers();
    const { archive, flusher } = await setup();
    flusher.start();
    flusher.markDirty(roomSnapshot('K7M2QX', 1));
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await archive.load('K7M2QX'))?.version).toBe(1);
    flusher.markDirty(roomSnapshot('K7M2QX', 2));
    await flusher.stop();
    expect((await archive.load('K7M2QX'))?.version).toBe(2);
  });
});
