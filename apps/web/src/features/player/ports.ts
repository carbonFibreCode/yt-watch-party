import type { VideoId } from '@watchparty/shared';

/** Player states we care about (YouTube's numeric states, named). */
export type PlayerState = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued';

/** The video player as the sync engine sees it (LLD SP-13); YouTubePlayerAdapter implements it. */
export interface VideoPlayer {
  /** Resolves once the underlying player can accept commands. */
  readonly whenReady: Promise<void>;
  load(videoId: VideoId, startSeconds: number, autoplay: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  getCurrentTime(): Promise<number>;
  getDuration(): Promise<number>;
  getState(): Promise<PlayerState>;
  isMuted(): Promise<boolean>;
  setMuted(muted: boolean): Promise<void>;
  onStateChange(listener: (state: PlayerState) => void): () => void;
  onError(listener: (code: number) => void): () => void;
  destroy(): void;
}

/** Server-epoch milliseconds, estimated on the client (LLD SP-12). */
export interface ServerClock {
  now(): number;
}
