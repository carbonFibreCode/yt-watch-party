import { describe, expect, it } from 'vitest';
import { END_TOLERANCE_S } from '@watchparty/shared';
import type { Room } from './Room';
import { HOST, hostedRoom, T0, video } from './test/builders';
import type { QueueItem } from './VideoQueue';

const DURATION_S = 100;
const FIRST = video('aaaaaaaaaaa', 'First');
const SECOND = video('bbbbbbbbbbb', 'Second');

const queued = (id: string, v = SECOND): QueueItem => ({ id, video: v, addedBy: HOST });

const playingRoom = (): Room => {
  const room = hostedRoom();
  room.changeVideo(FIRST, 0, T0);
  room.reportDuration(FIRST.id, DURATION_S);
  room.pullEvents();
  return room;
};

const endTime = T0 + DURATION_S * 1000;

describe('Room playback', () => {
  it('emits PlaybackChanged for every real change', () => {
    const room = playingRoom();
    room.pause(T0 + 1_000);
    room.seek(50, T0 + 2_000);
    room.play(T0 + 3_000);
    expect(room.pullEvents()).toEqual([
      { type: 'PlaybackChanged' },
      { type: 'PlaybackChanged' },
      { type: 'PlaybackChanged' },
    ]);
    expect(room.playback.rev).toBe(4);
  });

  it('stays silent for no-op transitions', () => {
    const room = playingRoom();
    room.play(T0 + 1_000);
    expect(room.pullEvents()).toEqual([]);
  });

  it('changes video with autoplay from the given offset', () => {
    const room = playingRoom();
    room.changeVideo(SECOND, 30, T0 + 5_000);
    expect(room.playback.video).toEqual(SECOND);
    expect(room.playback.positionAt(T0 + 5_000)).toBe(30);
    expect(room.playback.playState).toBe('playing');
  });

  it('cues a video paused at the offset', () => {
    const room = hostedRoom();
    room.cueVideo(FIRST, 15, T0);
    expect(room.playback).toMatchObject({ video: FIRST, isPlaying: false, anchorPosition: 15 });
    expect(room.pullEvents()).toEqual([{ type: 'PlaybackChanged' }]);
  });

  it('records duration without broadcasting', () => {
    const room = hostedRoom();
    room.changeVideo(FIRST, 0, T0);
    room.pullEvents();
    room.reportDuration(FIRST.id, 321);
    expect(room.playback.duration).toBe(321);
    expect(room.pullEvents()).toEqual([]);
  });

  describe('videoEnded', () => {
    it('advances to the next queued video', () => {
      const room = playingRoom();
      room.enqueue(queued('q1'), T0);
      room.pullEvents();
      room.videoEnded(FIRST.id, room.playback.rev, endTime);
      expect(room.playback.video).toEqual(SECOND);
      expect(room.queueItems()).toEqual([]);
      expect(room.pullEvents()).toEqual([{ type: 'PlaybackChanged' }, { type: 'QueueChanged' }]);
    });

    it('stops at the end when the queue is empty', () => {
      const room = playingRoom();
      room.videoEnded(FIRST.id, room.playback.rev, endTime);
      expect(room.playback.playState).toBe('paused');
      expect(room.playback.anchorPosition).toBe(DURATION_S);
    });

    it('accepts reports within the end tolerance', () => {
      const room = playingRoom();
      room.videoEnded(FIRST.id, room.playback.rev, endTime - END_TOLERANCE_S * 1000);
      expect(room.playback.playState).toBe('paused');
    });

    it('ignores early reports', () => {
      const room = playingRoom();
      room.videoEnded(FIRST.id, room.playback.rev, T0 + 10_000);
      expect(room.playback.playState).toBe('playing');
      expect(room.pullEvents()).toEqual([]);
    });

    it('ignores reports for a stale revision or another video', () => {
      const room = playingRoom();
      const rev = room.playback.rev;
      room.videoEnded(FIRST.id, rev - 1, endTime);
      room.videoEnded(SECOND.id, rev, endTime);
      expect(room.pullEvents()).toEqual([]);
    });

    it('ignores reports while the duration is unknown', () => {
      const room = hostedRoom();
      room.changeVideo(FIRST, 0, T0);
      room.pullEvents();
      room.videoEnded(FIRST.id, room.playback.rev, endTime);
      expect(room.pullEvents()).toEqual([]);
    });

    it('is idempotent: a duplicate report after advancing is stale', () => {
      const room = playingRoom();
      room.enqueue(queued('q1'), T0);
      room.enqueue(queued('q2', video('ccccccccccc', 'Third')), T0);
      const rev = room.playback.rev;
      room.videoEnded(FIRST.id, rev, endTime);
      room.videoEnded(FIRST.id, rev, endTime);
      expect(room.queueItems().map((i) => i.id)).toEqual(['q2']);
    });
  });

  describe('queue', () => {
    it('starts the video immediately when the room is idle', () => {
      const room = hostedRoom();
      room.enqueue(queued('q1'), T0);
      expect(room.playback.video).toEqual(SECOND);
      expect(room.queueItems()).toEqual([]);
      expect(room.pullEvents()).toEqual([{ type: 'PlaybackChanged' }]);
    });

    it('queues behind the current video', () => {
      const room = playingRoom();
      room.enqueue(queued('q1'), T0);
      expect(room.queueItems().map((i) => i.id)).toEqual(['q1']);
      expect(room.pullEvents()).toEqual([{ type: 'QueueChanged' }]);
    });

    it('removes queued items', () => {
      const room = playingRoom();
      room.enqueue(queued('q1'), T0);
      room.pullEvents();
      room.dequeue('q1');
      expect(room.queueItems()).toEqual([]);
      expect(room.pullEvents()).toEqual([{ type: 'QueueChanged' }]);
    });
  });
});
