import { describe, expect, it } from 'vitest';
import { CHAT_HISTORY_LIMIT } from '@watchparty/shared';
import type { Participant } from '../domain/Participant';
import { InMemoryChatRepository } from '../infrastructure/repositories/InMemoryChatRepository';
import { ChatService } from './ChatService';
import { FakeClock, RecordingBroadcaster, SeqIdGenerator, T0 } from './test/fakes';

const AUTHOR: Participant = {
  userId: 'u1',
  name: 'Hana',
  role: 'host',
  presence: 'online',
  awaySince: null,
  joinedAt: T0,
};

describe('ChatService', () => {
  it('persists and broadcasts a message', async () => {
    const broadcaster = new RecordingBroadcaster();
    const chat = new ChatService(
      new InMemoryChatRepository(),
      broadcaster,
      new SeqIdGenerator(),
      new FakeClock(),
    );
    await chat.post('K7M2QX', AUTHOR, 'hello');
    const expected = {
      id: 'id-1',
      user: { userId: 'u1', name: 'Hana', role: 'host' },
      text: 'hello',
      createdAt: T0,
    };
    expect(broadcaster.sent).toEqual([{ roomId: 'K7M2QX', event: 'chat_message', payload: expected }]);
    expect(await chat.history('K7M2QX')).toEqual([expected]);
  });

  it(`returns at most ${String(CHAT_HISTORY_LIMIT)} messages of history`, async () => {
    const chat = new ChatService(
      new InMemoryChatRepository(),
      new RecordingBroadcaster(),
      new SeqIdGenerator(),
      new FakeClock(),
    );
    for (let i = 0; i < CHAT_HISTORY_LIMIT + 5; i += 1) {
      await chat.post('K7M2QX', AUTHOR, `m${String(i)}`);
    }
    const history = await chat.history('K7M2QX');
    expect(history).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(history.at(-1)?.text).toBe(`m${String(CHAT_HISTORY_LIMIT + 4)}`);
  });
});
