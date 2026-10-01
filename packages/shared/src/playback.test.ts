import { describe, expect, it } from 'vitest';
import type { PlaybackView } from './contract/views';
import { projectPosition, timelineFromView } from './playback';
import type { PlaybackTimeline } from './playback';

const timeline = (overrides: Partial<PlaybackTimeline> = {}): PlaybackTimeline => ({
  isPlaying: true,
  anchorPosition: 10,
  anchorTime: 1_000_000,
  duration: null,
  ...overrides,
});

describe('projectPosition', () => {
  it('advances by elapsed wall time while playing', () => {
    expect(projectPosition(timeline(), 1_002_500)).toBe(12.5);
  });

  it('stays at the anchor while paused', () => {
    expect(projectPosition(timeline({ isPlaying: false }), 1_060_000)).toBe(10);
  });

  it('returns the anchor exactly at the anchor time', () => {
    expect(projectPosition(timeline(), 1_000_000)).toBe(10);
  });

  it('never moves backwards when the clock is behind the anchor', () => {
    expect(projectPosition(timeline(), 999_000)).toBe(10);
  });

  it('clamps to the duration once known', () => {
    expect(projectPosition(timeline({ duration: 11 }), 1_005_000)).toBe(11);
  });
});

describe('timelineFromView', () => {
  const view: PlaybackView = {
    videoId: 'dQw4w9WgXcQ',
    video: null,
    playState: 'playing',
    currentTime: 42,
    serverTime: 5_000,
    duration: 200,
    rev: 7,
  };

  it('maps the wire form to a timeline', () => {
    expect(timelineFromView(view)).toEqual({
      isPlaying: true,
      anchorPosition: 42,
      anchorTime: 5_000,
      duration: 200,
    });
  });

  it.each(['paused', 'idle'] as const)('treats %s as not playing', (playState) => {
    expect(timelineFromView({ ...view, playState }).isPlaying).toBe(false);
  });

  it('round-trips through projection on the client', () => {
    expect(projectPosition(timelineFromView(view), 6_000)).toBe(43);
  });
});
