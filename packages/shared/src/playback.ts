import type { PlaybackView } from './contract/views';

/**
 * A playback timeline anchored to server time (LLD SP-5). The same projection is used by the
 * server's PlaybackState, the client SyncEngine and the client time display (rules.md §4.1).
 */
export interface PlaybackTimeline {
  readonly isPlaying: boolean;
  /** Seconds into the video at `anchorTime`. */
  readonly anchorPosition: number;
  /** Server epoch milliseconds. */
  readonly anchorTime: number;
  readonly duration: number | null;
}

const MS_PER_SECOND = 1000;

export const projectPosition = (timeline: PlaybackTimeline, nowMs: number): number => {
  const elapsedS = timeline.isPlaying ? Math.max(0, nowMs - timeline.anchorTime) / MS_PER_SECOND : 0;
  const position = timeline.anchorPosition + elapsedS;
  return timeline.duration === null ? position : Math.min(position, timeline.duration);
};

/** Converts the wire form (`sync_state`) back into a timeline the client can project. */
export const timelineFromView = (view: PlaybackView): PlaybackTimeline => ({
  isPlaying: view.playState === 'playing',
  anchorPosition: view.currentTime,
  anchorTime: view.serverTime,
  duration: view.duration,
});
