import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useQuietRpc, useRoomStore, useServerClock } from '@/features/room/RoomContext';
import type { VideoId } from '@watchparty/shared';
import { DRIFT_CHECK_MS, PLAYER_READY_TIMEOUT_MS } from '@watchparty/shared';
import { clampVolume, usePlayerPrefs } from './playerPrefs';
import type { PlayerState, VideoPlayer } from './ports';
import { SyncEngine } from './SyncEngine';
import type { SyncStatus } from './SyncEngine';
import { YouTubePlayerAdapter } from './YouTubePlayerAdapter';

export interface PlayerSync {
  readonly status: SyncStatus;
  /** The YouTube player never finished loading (e.g. the connection dropped while it loaded). */
  readonly unavailable: boolean;
  readonly playerState: PlayerState;
  /** Length reported by this client's player for the given video. */
  readonly duration: { readonly videoId: VideoId; readonly seconds: number } | null;
  /** Last measured drift in ms (debugging aid and E2E hook). */
  readonly driftMs: number | null;
  /** Call from a user gesture to start blocked playback (keeps the viewer's mute choice). */
  readonly resume: () => void;
  /** The viewer's volume, 0–100 (remembered in this browser). */
  readonly volume: number;
  /** What the mute icon shows: the viewer muted, or autoplay forced a muted start. */
  readonly muted: boolean;
  /** User gesture only. Raising the volume above 0 also unmutes. */
  readonly setVolume: (volume: number) => void;
  /** User gesture only. */
  readonly setMuted: (muted: boolean) => void;
}

/** Unmuting at volume 0 would stay silent, so it comes back at this level. */
const UNMUTE_FROM_ZERO_VOLUME = 50;

/**
 * Mounts the YouTube player inside `container` and keeps it in sync with the room (LLD SP-13):
 * feeds every new playback state to the SyncEngine, ticks the drift loop, and re-checks as
 * soon as the tab becomes visible again.
 */
export const usePlayerSync = (container: RefObject<HTMLDivElement | null>): PlayerSync => {
  const store = useRoomStore();
  const quietRpc = useQuietRpc();
  const clock = useServerClock();
  const engineRef = useRef<SyncEngine | null>(null);
  const playerRef = useRef<VideoPlayer | null>(null);
  const volume = usePlayerPrefs((s) => s.volume);
  const prefMuted = usePlayerPrefs((s) => s.muted);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [playerState, setPlayerState] = useState<PlayerState>('unstarted');
  const [duration, setDuration] = useState<PlayerSync['duration']>(null);
  const [driftMs, setDriftMs] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (element === null) {
      return;
    }
    // The IFrame API replaces the element it is given, so give it one React does not own.
    const host = document.createElement('div');
    host.className = 'size-full';
    element.appendChild(host);
    const player = new YouTubePlayerAdapter(host);
    const stopWatchingState = player.onStateChange(setPlayerState);

    // youtube-player loads the IFrame API once per page and never retries a failed load, so a
    // player that never became ready can only be recovered by reloading the page (the session and
    // the presence grace period make that seamless). Do it as soon as the browser is back online.
    let ready = false;
    void player.whenReady.then(() => {
      ready = true;
      setUnavailable(false);
    });
    const readyTimer = setTimeout(() => {
      if (!ready) {
        setUnavailable(true);
      }
    }, PLAYER_READY_TIMEOUT_MS);
    const onOnline = (): void => {
      if (!ready) {
        window.location.reload();
      }
    };
    window.addEventListener('online', onOnline);
    const engine = new SyncEngine(player, clock, {
      durationKnown: (videoId, seconds) => {
        setDuration({ videoId, seconds });
        quietRpc('report_duration', { videoId, duration: seconds }).catch(() => undefined);
      },
      ended: (videoId, rev) => {
        quietRpc('video_ended', { videoId, rev }).catch(() => undefined);
      },
      statusChanged: setStatus,
      driftMeasured: (drift) => {
        setDriftMs(drift === null ? null : Math.round(drift * 1000));
      },
    });
    engineRef.current = engine;
    playerRef.current = player;
    // Restore this viewer's audio preferences once the player can take them.
    void player.whenReady.then(() => {
      const prefs = usePlayerPrefs.getState();
      player.setVolume(prefs.volume).catch(() => undefined);
      if (prefs.muted) {
        void engine.setMuted(true);
      }
    });

    const initial = store.getState().playback;
    if (initial !== null) {
      void engine.apply(initial);
    }
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.playback !== null && state.playback !== previous.playback) {
        void engine.apply(state.playback);
      }
    });
    const interval = setInterval(() => {
      void engine.tick();
    }, DRIFT_CHECK_MS);
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        void engine.tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(readyTimer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
      unsubscribe();
      stopWatchingState();
      engine.dispose();
      player.destroy();
      host.remove();
      engineRef.current = null;
      playerRef.current = null;
    };
  }, [container, store, quietRpc, clock]);

  const resume = useCallback(() => {
    void engineRef.current?.setMuted(usePlayerPrefs.getState().muted);
  }, []);

  const muted = prefMuted || status === 'muted';

  const setMuted = useCallback((next: boolean) => {
    const prefs = usePlayerPrefs.getState();
    prefs.setMuted(next);
    if (!next && prefs.volume === 0) {
      prefs.setVolume(UNMUTE_FROM_ZERO_VOLUME);
      playerRef.current?.setVolume(UNMUTE_FROM_ZERO_VOLUME).catch(() => undefined);
    }
    void engineRef.current?.setMuted(next);
  }, []);

  const setVolume = useCallback(
    (next: number) => {
      const level = clampVolume(next);
      usePlayerPrefs.getState().setVolume(level);
      playerRef.current?.setVolume(level).catch(() => undefined);
      // Like YouTube: turning the volume up while muted unmutes.
      if (level > 0 && muted) {
        void engineRef.current?.setMuted(false);
      }
    },
    [muted],
  );

  return { status, unavailable, playerState, duration, driftMs, resume, volume, muted, setVolume, setMuted };
};
