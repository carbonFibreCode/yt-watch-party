import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../application/ports';
import { testDatabase } from '../../test/db/testDatabase';
import { PgChatRepository } from './PgChatRepository';
import { PostgresRoomRepository } from './PostgresRoomRepository';
import { roomSnapshot } from './test/snapshots';

const database = testDatabase();

beforeEach(async () => {
  await database.reset();
  await new PostgresRoomRepository(database.db).create(roomSnapshot('K7M2QX'));
});

afterAll(async () => {
  await database.close();
});

const message = (id: string, createdAt: number): ChatMessage => ({
  id,
  roomId: 'K7M2QX',
  user: { userId: 'u1', name: 'Hana', role: 'host' },
  text: `message ${id}`,
  createdAt,
});

describe('PgChatRepository', () => {
  it('returns the latest messages oldest first with authors intact', async () => {
    const repo = new PgChatRepository(database.db);
    for (const [id, at] of [
      ['a', 1_000],
      ['b', 2_000],
      ['c', 3_000],
    ] as const) {
      await repo.append(message(id, at));
    }
    expect(await repo.recent('K7M2QX', 2)).toEqual([message('b', 2_000), message('c', 3_000)]);
  });

  it('returns nothing for a room without chat', async () => {
    expect(await new PgChatRepository(database.db).recent('K7M2QX', 10)).toEqual([]);
  });
});
