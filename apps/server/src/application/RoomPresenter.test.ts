import { describe, expect, it } from 'vitest';
import { DomainError } from '../domain/DomainError';
import { Room } from '../domain/Room';
import { RoomPresenter } from './RoomPresenter';
import { T0 } from './test/fakes';

const VIDEO = { id: 'dQw4w9WgXcQ', title: 'T', thumbnailUrl: 'x' };

const room = (): Room => {
  const r = Room.create({ id: 'K7M2QX', name: 'Movie night', host: { userId: 'h', name: 'Hana' }, now: T0 });
  r.join({ userId: 'h', name: 'Hana' }, T0);
  r.join({ userId: 'p', name: 'Pat' }, T0 + 1);
  r.join({ userId: 'm', name: 'Mo' }, T0 + 2);
  r.assignRole('h', 'm', 'moderator');
  r.changeVideo(VIDEO, 10, T0);
  r.enqueue({ id: 'q1', video: VIDEO, addedBy: { userId: 'h', name: 'Hana' } }, T0);
  r.createRequest('p', { type: 'seek', time: 5 }, 'r1', T0);
  r.createRequest('p', { type: 'change_video', video: VIDEO, startAt: 3 }, 'r2', T0);
  r.createRequest('p', { type: 'pause' }, 'r3', T0);
  return r;
};

describe('RoomPresenter', () => {
  it('projects playback to the presentation time', () => {
    expect(RoomPresenter.playback(room(), T0 + 2_000)).toEqual({
      videoId: VIDEO.id,
      video: VIDEO,
      playState: 'playing',
      currentTime: 12,
      serverTime: T0 + 2_000,
      duration: null,
      rev: 1,
    });
  });

  it('presents an idle room', () => {
    const idle = Room.create({ id: 'K7M2QX', name: 'x', host: { userId: 'h', name: 'H' }, now: T0 });
    expect(RoomPresenter.playback(idle, T0)).toMatchObject({ videoId: null, video: null, playState: 'idle' });
  });

  it('includes pending requests for staff only, without internal fields', () => {
    const r = room();
    const staff = RoomPresenter.roomView(r, 'm', T0);
    const participant = RoomPresenter.roomView(r, 'p', T0);
    expect(staff.pendingRequests.map((q) => q.action)).toEqual([
      { type: 'seek', time: 5 },
      { type: 'change_video', video: VIDEO },
      { type: 'pause' },
    ]);
    expect(participant.pendingRequests).toEqual([]);
    expect(participant.self).toEqual({
      userId: 'p',
      name: 'Pat',
      role: 'participant',
      presence: 'online',
      joinedAt: T0 + 1,
    });
    expect(participant.queue).toEqual([{ id: 'q1', video: VIDEO, addedBy: { userId: 'h', name: 'Hana' } }]);
    expect(participant.participants.map((p) => p.userId)).toEqual(['h', 'p', 'm']);
  });

  it('presents a queue_add request with its video', () => {
    const r = room();
    r.resolveRequest('h', 'r3', false, T0);
    r.createRequest('p', { type: 'queue_add', video: VIDEO }, 'r4', T0);
    expect(RoomPresenter.request(r.pendingRequests()[2]!).action).toEqual({
      type: 'queue_add',
      video: VIDEO,
    });
  });

  it('refuses a view for a non-member', () => {
    expect(() => RoomPresenter.roomView(room(), 'ghost', T0)).toThrow(new DomainError('NOT_IN_ROOM'));
  });

  it('strips the room id from chat messages', () => {
    const view = RoomPresenter.chatMessage({
      id: 'c1',
      roomId: 'K7M2QX',
      user: { userId: 'h', name: 'Hana', role: 'host' },
      text: 'hi',
      createdAt: T0,
    });
    expect(view).toEqual({
      id: 'c1',
      user: { userId: 'h', name: 'Hana', role: 'host' },
      text: 'hi',
      createdAt: T0,
    });
  });
});
