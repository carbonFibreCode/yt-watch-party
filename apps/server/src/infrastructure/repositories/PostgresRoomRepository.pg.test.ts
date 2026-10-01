import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../application/test/fakes';
import { testDatabase } from '../../test/db/testDatabase';
import { InMemoryRoomRepository } from './InMemoryRoomRepository';
import { PostgresRoomRepository } from './PostgresRoomRepository';
import { SnapshotFlusher } from './SnapshotFlusher';
import { describeRoomRepository } from './test/roomRepositoryContract';
import { roomSnapshot } from './test/snapshots';
import { TieredRoomRepository } from './TieredRoomRepository';

const database = testDatabase();

beforeEach(async () => {
  await database.reset();
});

afterAll(async () => {
  await database.close();
});

describeRoomRepository('PostgresRoomRepository', () => new PostgresRoomRepository(database.db));

describeRoomRepository('TieredRoomRepository (memory over Postgres)', () => {
  const archive = new PostgresRoomRepository(database.db);
  return new TieredRoomRepository(
    new InMemoryRoomRepository(),
    archive,
    new SnapshotFlusher(archive, new RecordingLogger()),
  );
});

describe('PostgresRoomRepository archive behavior', () => {
  it('saves only newer versions, so flushes from several instances stay monotonic', async () => {
    const repo = new PostgresRoomRepository(database.db);
    await repo.create(roomSnapshot('K7M2QX', 0));
    await repo.saveIfNewer(roomSnapshot('K7M2QX', 5));
    await repo.saveIfNewer(roomSnapshot('K7M2QX', 3));
    expect(await repo.load('K7M2QX')).toMatchObject({ version: 5, name: 'v5' });
  });

  it('treats the version column as authoritative', async () => {
    const repo = new PostgresRoomRepository(database.db);
    await repo.create(roomSnapshot('K7M2QX', 2));
    expect((await repo.load('K7M2QX'))?.version).toBe(2);
  });
});
