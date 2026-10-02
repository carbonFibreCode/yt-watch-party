import { describe, expect, it } from 'vitest';
import { FakeSocket } from '@/test/fakeSocket';
import { joinAck, participant, playback } from '@/test/fixtures';
import { bindRoomEvents } from './bindRoomEvents';
import type { Notifier } from './notifier';
import { createRoomStore } from './store';

const setup = () => {
  const socket = new FakeSocket();
  const store = createRoomStore();
  store.getState().hydrate(joinAck());
  const notes: string[] = [];
  const notify: Notifier = {
    info: (m) => notes.push(`info:${m}`),
    success: (m) => notes.push(`success:${m}`),
    warning: (m) => notes.push(`warning:${m}`),
    error: (m) => notes.push(`error:${m}`),
  };
  const unbind = bindRoomEvents(socket.asSocket(), store, notify, () => 42);
  const systemLines = (): string[] =>
    store.getState().chat.flatMap((entry) => (entry.kind === 'system' ? [entry.text] : []));
  return { socket, store, notes, unbind, systemLines };
};

describe('bindRoomEvents', () => {
  it('applies membership events and narrates them in the chat', () => {
    const { socket, store, systemLines } = setup();
    const others = [
      participant('host', { role: 'host' }),
      participant('me'),
      participant('sam', { name: 'Sam' }),
    ];
    socket.serverEmit('user_joined', {
      userId: 'sam',
      username: 'Sam',
      role: 'participant',
      participants: others,
    });
    socket.serverEmit('user_left', {
      userId: 'sam',
      username: 'Sam',
      reason: 'timeout',
      participants: others.slice(0, 2),
    });
    socket.serverEmit('user_left', {
      userId: 'x',
      username: 'Xi',
      reason: 'left',
      participants: others.slice(0, 2),
    });
    socket.serverEmit('presence_changed', {
      userId: 'me',
      presence: 'away',
      participants: [participant('me', { presence: 'away' })],
    });
    expect(systemLines()).toEqual(['Sam joined', 'Sam lost connection', 'Xi left']);
    expect(store.getState().participants).toEqual([participant('me', { presence: 'away' })]);
  });

  it('tells the user when their own role changes', () => {
    const { socket, notes, systemLines } = setup();
    socket.serverEmit('role_assigned', { userId: 'me', username: 'me', role: 'moderator', participants: [] });
    socket.serverEmit('role_assigned', {
      userId: 'host',
      username: 'host',
      role: 'viewer',
      participants: [],
    });
    expect(notes).toEqual(['info:You are now a moderator.']);
    expect(systemLines()).toEqual(['me is now a moderator', 'host is now a viewer']);
  });

  it('updates the host and congratulates the new host', () => {
    const { socket, store, notes, systemLines } = setup();
    socket.serverEmit('host_transferred', {
      fromUserId: 'host',
      toUserId: 'me',
      reason: 'manual',
      participants: [participant('me', { role: 'host' })],
    });
    expect(store.getState().hostId).toBe('me');
    expect(notes).toEqual(['success:You are now the host.']);
    expect(systemLines()).toEqual(['me is now the host']);
  });

  it('narrates removals using the name from before the removal', () => {
    const { socket, systemLines } = setup();
    socket.serverEmit('participant_removed', { userId: 'host', participants: [participant('me')] });
    socket.serverEmit('participant_removed', { userId: 'ghost', participants: [participant('me')] });
    expect(systemLines()).toEqual(['host was removed', 'Someone was removed']);
  });

  it('routes playback, queue, requests, chat, reactions and kicks to the store', () => {
    const { socket, store } = setup();
    socket.serverEmit('sync_state', playback({ rev: 9, currentTime: 9 }));
    socket.serverEmit('queue_updated', { queue: [] });
    socket.serverEmit('action_requested', {
      id: 'r1',
      requester: { userId: 'me', name: 'me' },
      action: { type: 'pause' },
      createdAt: 1,
      expiresAt: 2,
    });
    expect(store.getState().requests).toHaveLength(1);
    socket.serverEmit('request_resolved', { requestId: 'r1', status: 'approved' });
    socket.serverEmit('chat_message', {
      id: 'c2',
      user: { userId: 'me', name: 'me', role: 'participant' },
      text: 'yo',
      createdAt: 6,
    });
    socket.serverEmit('reaction', { id: 'x1', userId: 'me', name: 'me', emoji: '🔥', videoTime: 4, at: 7 });
    socket.serverEmit('kicked', { roomId: 'K7M2QX', reason: 'removed_by_host' });
    const s = store.getState();
    expect(s.reactions).toEqual([{ id: 'x1', userId: 'me', name: 'me', emoji: '🔥', videoTime: 4, at: 7 }]);
    expect(s.playback?.rev).toBe(9);
    expect(s.requests).toEqual([]);
    expect(s.chat.at(-1)).toMatchObject({ kind: 'message', text: 'yo' });
    expect(s.status).toBe('kicked');
  });

  it('tells the requester how their request was resolved, and only them', () => {
    const { socket, store, notes } = setup();
    store.getState().trackMyRequest('mine-1');
    store.getState().trackMyRequest('mine-2');
    store.getState().trackMyRequest('mine-3');
    socket.serverEmit('request_resolved', { requestId: 'mine-1', status: 'approved', resolvedBy: 'host' });
    socket.serverEmit('request_resolved', { requestId: 'mine-2', status: 'rejected' });
    socket.serverEmit('request_resolved', { requestId: 'mine-3', status: 'expired' });
    socket.serverEmit('request_resolved', {
      requestId: 'someone-else',
      status: 'approved',
      resolvedBy: 'host',
    });
    expect(notes).toEqual([
      'success:host approved your request.',
      'warning:The host declined your request.',
      'info:Your request expired before anyone answered it.',
    ]);
    expect(store.getState().myRequests).toEqual([]);
  });

  it('removes every listener on unbind', () => {
    const { socket, unbind } = setup();
    expect(socket.listenerCount()).toBe(13);
    unbind();
    expect(socket.listenerCount()).toBe(0);
  });
});
