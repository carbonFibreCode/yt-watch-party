import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabase } from '../../test/db/testDatabase';
import { user } from '../db/schema';
import { PgMembershipRepository } from './PgMembershipRepository';
import { PostgresRoomRepository } from './PostgresRoomRepository';
import { roomSnapshot } from './test/snapshots';

const database = testDatabase();

beforeEach(async () => {
  await database.reset();
  const rooms = new PostgresRoomRepository(database.db);
  await rooms.create(roomSnapshot('AAAAAA', 0, 'Room A'));
  await rooms.create(roomSnapshot('BBBBBB', 0, 'Room B'));
  await database.db
    .insert(user)
    .values(['anon', 'real'].map((id) => ({ id, name: id, email: `${id}@example.test` })));
});

afterAll(async () => {
  await database.close();
});

describe('PgMembershipRepository', () => {
  it('lists recent rooms newest first with their current names, updating on rejoin', async () => {
    const repo = new PgMembershipRepository(database.db);
    await repo.touch({ roomId: 'AAAAAA', userId: 'real', roomName: 'ignored', role: 'host', at: 1_000 });
    await repo.touch({ roomId: 'BBBBBB', userId: 'real', roomName: 'ignored', role: 'viewer', at: 2_000 });
    await repo.touch({ roomId: 'AAAAAA', userId: 'real', roomName: 'ignored', role: 'moderator', at: 3_000 });
    expect(await repo.recentForUser('real', 10)).toEqual([
      { roomId: 'AAAAAA', name: 'Room A', lastRole: 'moderator', lastJoinedAt: 3_000 },
      { roomId: 'BBBBBB', name: 'Room B', lastRole: 'viewer', lastJoinedAt: 2_000 },
    ]);
    expect(await repo.recentForUser('real', 1)).toHaveLength(1);
  });

  it('merges a guest history into the linked account, newest entry winning', async () => {
    const repo = new PgMembershipRepository(database.db);
    await repo.touch({ roomId: 'AAAAAA', userId: 'anon', roomName: '', role: 'host', at: 5_000 });
    await repo.touch({ roomId: 'BBBBBB', userId: 'anon', roomName: '', role: 'viewer', at: 1_000 });
    await repo.touch({ roomId: 'BBBBBB', userId: 'real', roomName: '', role: 'moderator', at: 4_000 });
    await repo.reassign('anon', 'real');
    expect(await repo.recentForUser('anon', 10)).toEqual([]);
    expect((await repo.recentForUser('real', 10)).map((r) => [r.roomId, r.lastRole, r.lastJoinedAt])).toEqual(
      [
        ['AAAAAA', 'host', 5_000],
        ['BBBBBB', 'moderator', 4_000],
      ],
    );
  });
});
