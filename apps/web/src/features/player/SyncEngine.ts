import {
  AUTOPLAY_DETECT_MS,
  END_TOLERANCE_S,
  MAX_LEARNABLE_DRIFT_S,
  MAX_SEEK_LEAD_S,
  POST_SEEK_COOLDOWN_MS,
  projectPosition,
  SEEK_LEAD_LEARNING_RATE,
  SEEK_THRESHOLD_S,
  timelineFromView,
} from '@watchparty/shared';
import type { PlaybackView, VideoId } from '@watchparty/shared';
import type { PlayerState, ServerClock, VideoPlayer } from './ports';

/** What the user should be told about playback. */
export type SyncStatus = 'idle' | 'loading' | 'in_sync' | 'buffering' | 'muted' | 'blocked' | 'embed_error';

export interface SyncEngineOutput {
  /** The player knows the video's length; tell the server (first report wins) and the UI. */
  durationKnown(videoId: VideoId, duration: number): void;
  /** The player reached the end of the room's current video at this revision. */
  ended(videoId: VideoId, rev: number): void;
  statusChanged(status: SyncStatus): void;
  /** Drift (actual − expected, seconds) measured on the last check; null when not measurable. */
  driftMeasured(driftS: number | null): void;
}

export interface SyncConfig {
  readonly seekThresholdS: number;
  readonly maxSeekLeadS: number;
  readonly postSeekCooldownMs: number;
  readonly autoplayDetectMs: number;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  seekThresholdS: SEEK_THRESHOLD_S,
  maxSeekLeadS: MAX_SEEK_LEAD_S,
  postSeekCooldownMs: POST_SEEK_COOLDOWN_MS,
  autoplayDetectMs: AUTOPLAY_DETECT_MS,
};

/** YouTube's "can't play here" error codes: not found/private (100) and embedding disabled (101/150). */
const EMBED_ERRORS: ReadonlySet<number> = new Set([100, 101, 150]);

/**
 * Keeps a VideoPlayer aligned with the room's server-authoritative timeline (LLD SP-13).
 *
 * - Intents never come from the player (native controls are disabled), so there is no echo loop:
 *   the engine only ever *reads* the player to correct it.
 * - Positions are projected with the synced server clock, so latency does not accumulate.
 * - Small drift is tolerated (seeking causes rebuffering); larger drift is corrected by a seek,
 *   followed by a cooldown so the player can settle.
 * - A player resumes *behind* where it was sent, by its buffering time. The engine learns that lag
 *   from the first measurement after each correction and leads later seeks by it, so viewers
 *   converge on the same frame instead of settling just under the threshold.
 * - Blocked autoplay falls back to muted playback (always allowed), then to a click-to-play gate.
 *
 * Framework-free and fully driven by its inputs, so it is unit-tested with fakes.
 */
export class SyncEngine {
  private target: PlaybackView | null = null;
  private loadedVideoId: VideoId | null = null;
  private lastSeekAt = Number.NEGATIVE_INFINITY;
  /** Learned buffering lag (s) added to positions when seeking/loading while playing. */
  private seekLeadS = 0;
  /** The next measurement shows how far behind the last playing seek/load landed. */
  private learnLead = false;
  private playRequestedAt: number | null = null;
  private durationReportedFor: VideoId | null = null;
  private endedReportedRev: number | null = null;
  private currentStatus: SyncStatus = 'idle';
  private queue: Promise<void> = Promise.resolve();
  private readonly unsubscribe: (() => void)[];

  constructor(
    private readonly player: VideoPlayer,
    private readonly clock: ServerClock,
    private readonly output: SyncEngineOutput,
    private readonly config: SyncConfig = DEFAULT_SYNC_CONFIG,
  ) {
    this.unsubscribe = [
      player.onStateChange((state) => {
        this.onPlayerState(state);
      }),
      player.onError((code) => {
        this.onPlayerError(code);
      }),
    ];
  }

  get status(): SyncStatus {
    return this.currentStatus;
  }

  /** A new room state arrived (join snapshot or `sync_state`). Older revisions are ignored. */
  apply(state: PlaybackView): Promise<void> {
    if (this.target !== null && state.rev <= this.target.rev && state.videoId === this.target.videoId) {
      return this.queue;
    }
    this.target = state;
    this.endedReportedRev = null;
    return this.enqueue(() => this.reconcile());
  }

  /** Periodic drift check (every DRIFT_CHECK_MS, and when the tab becomes visible again). */
  tick(): Promise<void> {
    return this.enqueue(() => this.reconcile());
  }

  /** A user gesture happened (e.g. "tap to unmute"): unmute and retry playback. */
  userGesture(): Promise<void> {
    return this.enqueue(async () => {
      await this.player.setMuted(false);
      this.playRequestedAt = null;
      if (this.currentStatus === 'muted' || this.currentStatus === 'blocked') {
        this.setStatus('loading');
      }
      await this.reconcile();
    });
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribe) {
      unsubscribe();
    }
  }

  /** Serializes reconciliation so concurrent applies/ticks never interleave player calls. */
  private enqueue(work: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(work).catch(() => {
      this.recover();
    });
    return this.queue;
  }

  /** A player call failed: forget what we think the player holds, so the next pass reloads it. */
  private recover(): void {
    this.loadedVideoId = null;
    this.learnLead = false;
  }

  private async reconcile(): Promise<void> {
    const target = this.target;
    if (target?.videoId === null || target === null) {
      this.setStatus('idle');
      this.output.driftMeasured(null);
      return;
    }
    if (this.currentStatus === 'embed_error' && this.loadedVideoId === target.videoId) {
      return;
    }
    const now = this.clock.now();
    const expected = projectPosition(timelineFromView(target), now);
    const shouldPlay = target.playState === 'playing';

    if (this.loadedVideoId !== target.videoId) {
      await this.player.load(target.videoId, this.seekPosition(expected, shouldPlay), shouldPlay);
      this.loadedVideoId = target.videoId;
      this.lastSeekAt = now;
      this.learnLead = shouldPlay;
      this.playRequestedAt = shouldPlay ? now : null;
      this.setStatus('loading');
      return;
    }

    const state = await this.player.getState();
    if (!shouldPlay && (state === 'playing' || state === 'buffering')) {
      await this.player.pause();
    }
    if (state === 'ended') {
      return;
    }

    // Drift correction waits out the cooldown; play/pause below is always enforced.
    if (now - this.lastSeekAt >= this.config.postSeekCooldownMs) {
      const actual = await this.player.getCurrentTime();
      const drift = actual - expected;
      this.output.driftMeasured(drift);
      if (this.learnLead && state === 'playing') {
        this.learnLead = false;
        if (Math.abs(drift) <= MAX_LEARNABLE_DRIFT_S) {
          const lead = this.seekLeadS - drift * SEEK_LEAD_LEARNING_RATE;
          this.seekLeadS = Math.min(Math.max(lead, 0), this.config.maxSeekLeadS);
        }
      }
      if (Math.abs(drift) > this.config.seekThresholdS) {
        await this.player.seekTo(this.seekPosition(expected, shouldPlay));
        this.lastSeekAt = now;
        this.learnLead = shouldPlay;
      }
    }

    if (shouldPlay) {
      await this.ensurePlaying(state, now);
    } else {
      this.playRequestedAt = null;
      this.setStatus('in_sync');
    }
  }

  private async ensurePlaying(state: PlayerState, now: number): Promise<void> {
    if (state === 'playing') {
      this.playRequestedAt = null;
      this.setStatus((await this.player.isMuted()) && this.currentStatus === 'muted' ? 'muted' : 'in_sync');
      return;
    }
    if (state === 'buffering') {
      this.setStatus('buffering');
      return;
    }
    if (this.currentStatus === 'blocked') {
      return;
    }
    if (this.playRequestedAt !== null && now - this.playRequestedAt >= this.config.autoplayDetectMs) {
      // Play was requested but never started: autoplay is blocked.
      if (await this.player.isMuted()) {
        this.setStatus('blocked');
        return;
      }
      await this.player.setMuted(true);
      this.setStatus('muted');
    }
    this.playRequestedAt ??= now;
    await this.player.play();
  }

  /** Where to send the player: ahead by the learned lag while playing, exact while paused. */
  private seekPosition(expected: number, playing: boolean): number {
    return playing ? expected + this.seekLeadS : expected;
  }

  private onPlayerState(state: PlayerState): void {
    const target = this.target;
    if (target?.videoId === null || target === null) {
      return;
    }
    if (state === 'playing' && this.durationReportedFor !== target.videoId) {
      const videoId = target.videoId;
      void this.player.getDuration().then((duration) => {
        if (duration > 0 && this.durationReportedFor !== videoId) {
          this.durationReportedFor = videoId;
          this.output.durationKnown(videoId, duration);
        }
      });
    }
    if (state === 'buffering' && this.currentStatus === 'in_sync') {
      this.setStatus('buffering');
    }
    if (state === 'playing' && (this.currentStatus === 'buffering' || this.currentStatus === 'loading')) {
      this.setStatus('in_sync');
    }
    if (state === 'ended' && target.playState === 'playing' && this.endedReportedRev !== target.rev) {
      const expected = projectPosition(timelineFromView(target), this.clock.now());
      const nearEnd = target.duration === null || expected >= target.duration - END_TOLERANCE_S;
      if (nearEnd) {
        this.endedReportedRev = target.rev;
        this.output.ended(target.videoId, target.rev);
      }
    }
  }

  private onPlayerError(code: number): void {
    if (EMBED_ERRORS.has(code)) {
      this.setStatus('embed_error');
    }
  }

  private setStatus(status: SyncStatus): void {
    if (status !== this.currentStatus) {
      this.currentStatus = status;
      this.output.statusChanged(status);
    }
  }
}
