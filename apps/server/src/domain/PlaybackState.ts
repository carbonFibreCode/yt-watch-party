import { projectPosition } from '@watchparty/shared';
import type { PlaybackTimeline, PlayState, VideoId } from '@watchparty/shared';
import type { VideoRef } from './VideoRef';

export interface PlaybackSnapshot extends PlaybackTimeline {
  readonly video: VideoRef | null;
  readonly rev: number;
}

/**
 * Immutable timeline anchored to server time (LLD SP-5). Every observable change returns a new
 * instance with `rev + 1`; no-op transitions return `this` so callers can detect "nothing changed".
 */
export class PlaybackState implements PlaybackTimeline {
  private constructor(
    readonly video: VideoRef | null,
    readonly isPlaying: boolean,
    readonly anchorPosition: number,
    readonly anchorTime: number,
    readonly duration: number | null,
    readonly rev: number,
  ) {}

  static idle(now: number): PlaybackState {
    return new PlaybackState(null, false, 0, now, null, 0);
  }

  static fromSnapshot(s: PlaybackSnapshot): PlaybackState {
    return new PlaybackState(s.video, s.isPlaying, s.anchorPosition, s.anchorTime, s.duration, s.rev);
  }

  toSnapshot(): PlaybackSnapshot {
    return {
      video: this.video,
      isPlaying: this.isPlaying,
      anchorPosition: this.anchorPosition,
      anchorTime: this.anchorTime,
      duration: this.duration,
      rev: this.rev,
    };
  }

  get playState(): PlayState {
    if (this.video === null) {
      return 'idle';
    }
    return this.isPlaying ? 'playing' : 'paused';
  }

  positionAt(now: number): number {
    return projectPosition(this, now);
  }

  play(now: number): PlaybackState {
    if (this.video === null || this.isPlaying) {
      return this;
    }
    const position = this.positionAt(now);
    const atEnd = this.duration !== null && position >= this.duration;
    return this.next({ isPlaying: true, anchorPosition: atEnd ? 0 : position, anchorTime: now });
  }

  pause(now: number): PlaybackState {
    if (!this.isPlaying) {
      return this;
    }
    return this.next({ isPlaying: false, anchorPosition: this.positionAt(now), anchorTime: now });
  }

  seek(time: number, now: number): PlaybackState {
    if (this.video === null) {
      return this;
    }
    return this.next({ anchorPosition: this.clamp(time), anchorTime: now });
  }

  load(video: VideoRef, startAt: number, now: number, autoplay: boolean): PlaybackState {
    return new PlaybackState(video, autoplay, Math.max(0, startAt), now, null, this.rev + 1);
  }

  /** Stops at the end of the current video (used when the queue is empty). */
  finish(now: number): PlaybackState {
    if (this.video === null) {
      return this;
    }
    return this.next({
      isPlaying: false,
      anchorPosition: this.duration ?? this.positionAt(now),
      anchorTime: now,
    });
  }

  /** First valid duration report for the current video wins; it is metadata, so `rev` is unchanged. */
  withDuration(videoId: VideoId, duration: number): PlaybackState {
    if (this.video?.id !== videoId || this.duration !== null) {
      return this;
    }
    return new PlaybackState(
      this.video,
      this.isPlaying,
      this.anchorPosition,
      this.anchorTime,
      duration,
      this.rev,
    );
  }

  private clamp(time: number): number {
    return Math.min(Math.max(0, time), this.duration ?? Number.POSITIVE_INFINITY);
  }

  /** Every transition re-anchors the timeline and bumps `rev`, so revisions only ever increase. */
  private next(changes: {
    readonly isPlaying?: boolean;
    readonly anchorPosition: number;
    readonly anchorTime: number;
  }): PlaybackState {
    return new PlaybackState(
      this.video,
      changes.isPlaying ?? this.isPlaying,
      changes.anchorPosition,
      changes.anchorTime,
      this.duration,
      this.rev + 1,
    );
  }
}
