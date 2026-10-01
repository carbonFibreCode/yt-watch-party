import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../application/ports';
import { InMemoryChatRepository } from './InMemoryChatRepository';

const message = (id: string, roomId = 'K7M2QX'): ChatMessage => ({
  id,
  roomId,
  user: { userId: 'u1', name: 'Hana', role: 'host' },
  text: `msg ${id}`,
  createdAt: Number(id),
});

describe('InMemoryChatRepository', () => {
  it('returns the latest messages oldest first, per room', async () => {
    const repo = new InMemoryChatRepository();
    for (const id of ['1', '2', '3']) {
      await repo.append(message(id));
    }
    await repo.append(message('9', 'AAAAAA'));
    expect((await repo.recent('K7M2QX', 2)).map((m) => m.id)).toEqual(['2', '3']);
    expect(await repo.recent('BBBBBB', 2)).toEqual([]);
  });
});
