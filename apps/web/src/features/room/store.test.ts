import { describe, expect, it } from 'vitest';
import { joinAck, participant, playback } from '@/test/fixtures';
import { CHAT_RENDER_LIMIT } from '@watchparty/shared';
import type { RequestView } from '@watchparty/shared';
import { createRoomStore, selectIsSelf, selectSelf } from './store';

const request = (id: string): RequestView => ({
  id,
  requester: { userId: 'me', name: 'me' },
  action: { type: 'play' },
  createdAt: 1,
  expiresAt: 2,
});

describe('room store', () => {
  it('starts connecting and hydrates from the join ack', () => {
    const store = createRoomStore();
    expect(store.getState().status).toBe('connecting');
    store.getState().hydrate(joinAck());
    const s = store.getState();
    expect(s).toMatchObject({
      status: 'joined',
      roomId: 'K7M2QX',
      name: 'Movie night',
      hostId: 'host',
      selfId: 'me',
    });
    expect(s.chat).toEqual([
      {
        kind: 'message',
        id: 'c1',
        user: { userId: 'host', name: 'host', role: 'host' },
        text: 'hi',
        createdAt: 5,
      },
    ]);
    expect(selectSelf(s)?.userId).toBe('me');
    expect(selectIsSelf('me')(s)).toBe(true);
  });

  it('only accepts newer playback revisions', () => {
    const store = createRoomStore();
    store.getState().applyPlayback(playback({ rev: 3, currentTime: 30 }));
    store.getState().applyPlayback(playback({ rev: 2, currentTime: 20 }));
    store.getState().applyPlayback(playback({ rev: 3, currentTime: 99 }));
    expect(store.getState().playback?.currentTime).toBe(30);
    store.getState().applyPlayback(playback({ rev: 4, currentTime: 40 }));
    expect(store.getState().playback?.currentTime).toBe(40);
  });

  it('de-duplicates requests by id and removes resolved ones', () => {
    const store = createRoomStore();
    store.getState().addRequest(request('r1'));
    store.getState().addRequest(request('r1'));
    store.getState().addRequest(request('r2'));
    expect(store.getState().requests.map((r) => r.id)).toEqual(['r1', 'r2']);
    store.getState().removeRequest('r1');
    expect(store.getState().requests.map((r) => r.id)).toEqual(['r2']);
  });

  it('ignores duplicate chat messages and caps the history', () => {
    const store = createRoomStore();
    const message = {
      id: 'm',
      user: { userId: 'a', name: 'a', role: 'host' as const },
      text: 'x',
      createdAt: 1,
    };
    store.getState().addChat(message);
    store.getState().addChat(message);
    expect(store.getState().chat).toHaveLength(1);
    for (let i = 0; i < CHAT_RENDER_LIMIT + 10; i += 1) {
      store.getState().addSystem(`line ${String(i)}`, i);
    }
    const { chat } = store.getState();
    expect(chat).toHaveLength(CHAT_RENDER_LIMIT);
    expect(chat.at(-1)).toMatchObject({ kind: 'system', text: `line ${String(CHAT_RENDER_LIMIT + 9)}` });
    expect(new Set(chat.map((e) => e.id)).size).toBe(CHAT_RENDER_LIMIT);
  });

  it('tracks failure, kick, connection, host and queue', () => {
    const store = createRoomStore();
    store.getState().fail('BANNED');
    expect(store.getState()).toMatchObject({ status: 'failed', failure: 'BANNED' });
    store.getState().kicked();
    store.getState().setConnection('reconnecting');
    store.getState().setHost('me');
    store.getState().setQueue([{ id: 'q', video: playback().video!, addedBy: { userId: 'a', name: 'a' } }]);
    store.getState().setParticipants([participant('x')]);
    expect(store.getState()).toMatchObject({ status: 'kicked', connection: 'reconnecting', hostId: 'me' });
    expect(store.getState().queue).toHaveLength(1);
    expect(store.getState().participants).toHaveLength(1);
  });
});
