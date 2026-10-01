import YouTubePlayerFactory from 'youtube-player';
import type { VideoId } from '@watchparty/shared';
import type { PlayerState, VideoPlayer } from './ports';

type Factory = typeof YouTubePlayerFactory;
type YouTubePlayer = ReturnType<Factory>;

/** YouTube's numeric player states (IFrame API), named. */
const STATES: Readonly<Record<number, PlayerState>> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
};

const eventData = (event: object): unknown => ('data' in event ? event.data : undefined);

/**
 * VideoPlayer over the YouTube IFrame API via `youtube-player` (LLD SP-13). Native controls and
 * keyboard are disabled: the only way to change playback is the app's own control bar, so player
 * events are never mistaken for user intent (no echo loops by construction).
 */
export class YouTubePlayerAdapter implements VideoPlayer {
  private readonly player: YouTubePlayer;
  private readonly stateListeners = new Set<(state: PlayerState) => void>();
  private readonly errorListeners = new Set<(code: number) => void>();

  /** `host` is replaced by the iframe, so it must be an element React does not manage. */
  constructor(host: HTMLElement, factory: Factory = YouTubePlayerFactory) {
    this.player = factory(host, {
      width: '100%',
      height: '100%',
      playerVars: {
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        playsinline: 1,
        rel: 0,
        origin: window.location.origin,
      },
    });
    // One listener per event for the player's lifetime; subscribers fan out from our own sets
    // (the typings do not expose `off`).
    this.player.on('stateChange', (event) => {
      const state = STATES[event.data];
      if (state !== undefined) {
        for (const listener of this.stateListeners) {
          listener(state);
        }
      }
    });
    this.player.on('error', (event) => {
      const code = eventData(event);
      if (typeof code === 'number') {
        for (const listener of this.errorListeners) {
          listener(code);
        }
      }
    });
  }

  load(videoId: VideoId, startSeconds: number, autoplay: boolean): Promise<void> {
    const video = { videoId, startSeconds };
    return autoplay ? this.player.loadVideoById(video) : this.player.cueVideoById(video);
  }

  play(): Promise<void> {
    return this.player.playVideo();
  }

  pause(): Promise<void> {
    return this.player.pauseVideo();
  }

  seekTo(seconds: number): Promise<void> {
    return this.player.seekTo(seconds, true);
  }

  getCurrentTime(): Promise<number> {
    return this.player.getCurrentTime();
  }

  getDuration(): Promise<number> {
    return this.player.getDuration();
  }

  async getState(): Promise<PlayerState> {
    return STATES[await this.player.getPlayerState()] ?? 'unstarted';
  }

  isMuted(): Promise<boolean> {
    return this.player.isMuted();
  }

  setMuted(muted: boolean): Promise<void> {
    return muted ? this.player.mute() : this.player.unMute();
  }

  onStateChange(listener: (state: PlayerState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onError(listener: (code: number) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  destroy(): void {
    this.stateListeners.clear();
    this.errorListeners.clear();
    void this.player.destroy();
  }
}
