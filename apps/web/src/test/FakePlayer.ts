import type { PlayerState, ServerClock, VideoPlayer } from '@/features/player/ports';
import type { VideoId } from '@watchparty/shared';

export class FakeClock implements ServerClock {
  constructor(public current = 1_000_000) {}

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

/**
 * A simulated player on the fake clock: position advances while playing; autoplay can be
 * blocked unless muted (like a browser), and every call is recorded.
 */
export class FakePlayer implements VideoPlayer {
  videoId: VideoId | null = null;
  state: PlayerState = 'unstarted';
  muted = false;
  /** Browser refuses unmuted programmatic play. */
  blockUnmutedAutoplay = false;
  /** Browser refuses even muted play. */
  blockAllAutoplay = false;
  duration = 200;
  readonly whenReady = Promise.resolve();
  /** The next `load` call rejects, like a player whose API failed to initialize. */
  failNextLoad = false;
  /** Simulated buffering: after a seek/load while playing, the position stays put this long. */
  seekLagMs = 0;
  readonly calls: string[] = [];
  private anchorPosition = 0;
  private anchorTime: number;
  private readonly stateListeners = new Set<(s: PlayerState) => void>();
  private readonly errorListeners = new Set<(code: number) => void>();

  constructor(private readonly clock: FakeClock) {
    this.anchorTime = clock.now();
  }

  private position(): number {
    const elapsed = this.state === 'playing' ? Math.max(0, this.clock.now() - this.anchorTime) / 1000 : 0;
    return Math.min(this.anchorPosition + elapsed, this.duration);
  }

  private reanchor(position = this.position()): void {
    this.anchorPosition = position;
    this.anchorTime = this.clock.now();
  }

  private setState(state: PlayerState): void {
    this.reanchor();
    this.state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private tryPlay(): void {
    const blocked = this.blockAllAutoplay || (this.blockUnmutedAutoplay && !this.muted);
    this.setState(blocked ? 'paused' : 'playing');
  }

  load(videoId: VideoId, startSeconds: number, autoplay: boolean): Promise<void> {
    this.calls.push(`load:${videoId}@${startSeconds.toFixed(1)}:${String(autoplay)}`);
    if (this.failNextLoad) {
      this.failNextLoad = false;
      return Promise.reject(new Error('player unavailable'));
    }
    this.videoId = videoId;
    this.reanchor(startSeconds);
    if (autoplay) {
      this.tryPlay();
      this.bufferAfterJump();
    } else {
      this.setState('cued');
    }
    return Promise.resolve();
  }

  /** While playing, a jump only starts advancing after `seekLagMs` (like a real player buffering). */
  private bufferAfterJump(): void {
    if (this.state === 'playing') {
      this.anchorTime = this.clock.now() + this.seekLagMs;
    }
  }

  play(): Promise<void> {
    this.calls.push('play');
    this.tryPlay();
    return Promise.resolve();
  }

  pause(): Promise<void> {
    this.calls.push('pause');
    this.setState('paused');
    return Promise.resolve();
  }

  seekTo(seconds: number): Promise<void> {
    this.calls.push(`seek:${seconds.toFixed(1)}`);
    this.reanchor(seconds);
    this.bufferAfterJump();
    return Promise.resolve();
  }

  getCurrentTime(): Promise<number> {
    return Promise.resolve(this.position());
  }

  getDuration(): Promise<number> {
    return Promise.resolve(this.duration);
  }

  getState(): Promise<PlayerState> {
    return Promise.resolve(this.state);
  }

  isMuted(): Promise<boolean> {
    return Promise.resolve(this.muted);
  }

  setMuted(muted: boolean): Promise<void> {
    this.calls.push(muted ? 'mute' : 'unmute');
    this.muted = muted;
    return Promise.resolve();
  }

  onStateChange(listener: (s: PlayerState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onError(listener: (code: number) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  destroy(): void {
    this.calls.push('destroy');
  }

  /** Test helpers: simulate things the real player does on its own. */
  drift(byS: number): void {
    this.reanchor(this.position() + byS);
  }

  emitState(state: PlayerState): void {
    this.setState(state);
  }

  emitError(code: number): void {
    for (const listener of this.errorListeners) {
      listener(code);
    }
  }

  listenerCount(): number {
    return this.stateListeners.size + this.errorListeners.size;
  }
}
