import { describe, expect, it } from 'vitest';
import { PlaybackState } from './PlaybackState';
import { T0, video } from './test/builders';

const loaded = (now = T0): PlaybackState => PlaybackState.idle(now).load(video(), 0, now, true);

describe('PlaybackState', () => {
  describe('idle', () => {
    it('starts idle at revision 0', () => {
      const idle = PlaybackState.idle(T0);
      expect(idle.playState).toBe('idle');
      expect(idle.rev).toBe(0);
    });

    it.each([
      ['play', (s: PlaybackState) => s.play(T0)],
      ['seek', (s: PlaybackState) => s.seek(10, T0)],
      ['finish', (s: PlaybackState) => s.finish(T0)],
    ])('ignores %s without a video', (_label, transition) => {
      const idle = PlaybackState.idle(T0);
      expect(transition(idle)).toBe(idle);
    });
  });

  describe('load', () => {
    it('loads a video at the start offset, autoplaying, and bumps rev', () => {
      const state = PlaybackState.idle(T0).load(video(), 42, T0, true);
      expect(state.playState).toBe('playing');
      expect(state.positionAt(T0)).toBe(42);
      expect(state.rev).toBe(1);
    });

    it('can cue without autoplay', () => {
      expect(PlaybackState.idle(T0).load(video(), 0, T0, false).playState).toBe('paused');
    });

    it('clamps a negative start offset to zero', () => {
      expect(PlaybackState.idle(T0).load(video(), -5, T0, true).anchorPosition).toBe(0);
    });

    it('forgets the previous duration', () => {
      const withDuration = loaded().withDuration(video().id, 200);
      expect(withDuration.load(video('aaaaaaaaaaa'), 0, T0, true).duration).toBeNull();
    });
  });

  describe('play / pause', () => {
    it('pausing anchors the projected position', () => {
      const paused = loaded().pause(T0 + 3_000);
      expect(paused.playState).toBe('paused');
      expect(paused.positionAt(T0 + 60_000)).toBe(3);
      expect(paused.rev).toBe(2);
    });

    it('playing resumes from the paused position', () => {
      const resumed = loaded()
        .pause(T0 + 3_000)
        .play(T0 + 10_000);
      expect(resumed.positionAt(T0 + 12_000)).toBe(5);
    });

    it('treats repeated play and pause as no-ops without a new revision', () => {
      const playing = loaded();
      expect(playing.play(T0 + 1_000)).toBe(playing);
      const paused = playing.pause(T0 + 1_000);
      expect(paused.pause(T0 + 2_000)).toBe(paused);
    });

    it('restarts from zero when playing a finished video', () => {
      const finished = loaded()
        .withDuration(video().id, 10)
        .finish(T0 + 10_000);
      expect(finished.play(T0 + 20_000).positionAt(T0 + 20_000)).toBe(0);
    });
  });

  describe('seek', () => {
    it('moves the anchor and keeps the play state', () => {
      const sought = loaded().seek(90, T0 + 1_000);
      expect(sought.positionAt(T0 + 1_000)).toBe(90);
      expect(sought.playState).toBe('playing');
      expect(sought.rev).toBe(2);
    });

    it('clamps to zero and to the known duration', () => {
      const state = loaded().withDuration(video().id, 100);
      expect(state.seek(-10, T0).anchorPosition).toBe(0);
      expect(state.seek(500, T0).anchorPosition).toBe(100);
    });
  });

  describe('withDuration', () => {
    it('records the first report for the current video without bumping rev', () => {
      const state = loaded().withDuration(video().id, 212);
      expect(state.duration).toBe(212);
      expect(state.rev).toBe(1);
    });

    it('ignores later reports and reports for other videos', () => {
      const state = loaded().withDuration(video().id, 212);
      expect(state.withDuration(video().id, 999)).toBe(state);
      expect(loaded().withDuration('zzzzzzzzzzz', 50).duration).toBeNull();
    });
  });

  describe('finish', () => {
    it('pauses at the duration', () => {
      const finished = loaded()
        .withDuration(video().id, 30)
        .finish(T0 + 29_000);
      expect(finished.playState).toBe('paused');
      expect(finished.anchorPosition).toBe(30);
    });

    it('pauses at the projected position when the duration is unknown', () => {
      expect(loaded().finish(T0 + 7_000).anchorPosition).toBe(7);
    });
  });

  it('round-trips through a snapshot', () => {
    const state = loaded()
      .withDuration(video().id, 120)
      .seek(30, T0 + 500);
    expect(PlaybackState.fromSnapshot(state.toSnapshot()).toSnapshot()).toEqual(state.toSnapshot());
  });
});
