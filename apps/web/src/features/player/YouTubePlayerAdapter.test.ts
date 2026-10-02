import { afterEach, describe, expect, it, vi } from 'vitest';
import type YouTubePlayerFactory from 'youtube-player';
import { PLAYER_CALL_TIMEOUT_MS } from '@watchparty/shared';
import { PlayerUnavailableError, YouTubePlayerAdapter } from './YouTubePlayerAdapter';

type Factory = typeof YouTubePlayerFactory;

/** A stand-in for the youtube-player object: records calls, lets tests fire player events. */
const fakeFactory = () => {
  const handlers = new Map<string, (event: object) => void>();
  const player = {
    on: (name: string, handler: (event: object) => void) => handlers.set(name, handler),
    loadVideoById: vi.fn(() => Promise.resolve()),
    cueVideoById: vi.fn(() => Promise.resolve()),
    playVideo: vi.fn(() => Promise.resolve()),
    pauseVideo: vi.fn(() => Promise.resolve()),
    seekTo: vi.fn(() => Promise.resolve()),
    getCurrentTime: vi.fn(() => Promise.resolve(12.5)),
    getDuration: vi.fn(() => Promise.resolve(200)),
    getPlayerState: vi.fn(() => Promise.resolve(1)),
    isMuted: vi.fn(() => Promise.resolve(false)),
    mute: vi.fn(() => Promise.resolve()),
    unMute: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(() => Promise.resolve()),
  };
  const factory = vi.fn(() => player) as unknown as Factory;
  return { player, factory, fire: (name: string, event: object) => handlers.get(name)?.(event) };
};

describe('YouTubePlayerAdapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('becomes ready on the player’s ready event', async () => {
    const { factory, fire } = fakeFactory();
    const adapter = new YouTubePlayerAdapter(document.createElement('div'), factory);
    let ready = false;
    void adapter.whenReady.then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);
    fire('ready', {});
    await adapter.whenReady;
    expect(ready).toBe(true);
  });

  it('fails calls that never settle instead of hanging (API never loaded)', async () => {
    vi.useFakeTimers();
    const { factory, player } = fakeFactory();
    player.playVideo.mockReturnValue(new Promise(() => undefined));
    const adapter = new YouTubePlayerAdapter(document.createElement('div'), factory);
    const play = adapter.play();
    vi.advanceTimersByTime(PLAYER_CALL_TIMEOUT_MS);
    await expect(play).rejects.toBeInstanceOf(PlayerUnavailableError);
  });

  it('creates the player with native controls and keyboard disabled', () => {
    const { factory } = fakeFactory();
    const host = document.createElement('div');
    new YouTubePlayerAdapter(host, factory);
    expect(factory).toHaveBeenCalledWith(host, {
      width: '100%',
      height: '100%',
      playerVars: expect.objectContaining({
        controls: 0,
        disablekb: 1,
        playsinline: 1,
        origin: window.location.origin,
      }) as object,
    });
  });

  it('loads with autoplay, or cues without', async () => {
    const { factory, player } = fakeFactory();
    const adapter = new YouTubePlayerAdapter(document.createElement('div'), factory);
    await adapter.load('dQw4w9WgXcQ', 30, true);
    await adapter.load('aaaaaaaaaaa', 5, false);
    expect(player.loadVideoById).toHaveBeenCalledWith({ videoId: 'dQw4w9WgXcQ', startSeconds: 30 });
    expect(player.cueVideoById).toHaveBeenCalledWith({ videoId: 'aaaaaaaaaaa', startSeconds: 5 });
  });

  it('maps controls, queries and mute to the IFrame API', async () => {
    const { factory, player } = fakeFactory();
    const adapter = new YouTubePlayerAdapter(document.createElement('div'), factory);
    await adapter.play();
    await adapter.pause();
    await adapter.seekTo(42);
    await adapter.setMuted(true);
    await adapter.setMuted(false);
    expect(player.seekTo).toHaveBeenCalledWith(42, true);
    expect(
      [player.playVideo, player.pauseVideo, player.mute, player.unMute].every(
        (f) => f.mock.calls.length === 1,
      ),
    ).toBe(true);
    expect(await adapter.getCurrentTime()).toBe(12.5);
    expect(await adapter.getDuration()).toBe(200);
    expect(await adapter.isMuted()).toBe(false);
    expect(await adapter.getState()).toBe('playing');
    player.getPlayerState.mockResolvedValueOnce(42);
    expect(await adapter.getState()).toBe('unstarted');
  });

  it('names state changes and forwards numeric errors to subscribers until they unsubscribe', () => {
    const { factory, fire } = fakeFactory();
    const adapter = new YouTubePlayerAdapter(document.createElement('div'), factory);
    const states: string[] = [];
    const errors: number[] = [];
    const offState = adapter.onStateChange((s) => states.push(s));
    adapter.onError((c) => errors.push(c));
    fire('stateChange', { data: 3 });
    fire('stateChange', { data: 0 });
    fire('stateChange', { data: 99 });
    fire('error', { data: 150 });
    fire('error', {});
    offState();
    fire('stateChange', { data: 1 });
    expect(states).toEqual(['buffering', 'ended']);
    expect(errors).toEqual([150]);
  });

  it('destroys the player and drops subscribers', () => {
    const { factory, player, fire } = fakeFactory();
    const adapter = new YouTubePlayerAdapter(document.createElement('div'), factory);
    const states: string[] = [];
    adapter.onStateChange((s) => states.push(s));
    adapter.destroy();
    fire('stateChange', { data: 1 });
    expect(player.destroy).toHaveBeenCalledOnce();
    expect(states).toEqual([]);
  });
});
