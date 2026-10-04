import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomContext } from '@/features/room/RoomContext';
import type { RoomContextValue } from '@/features/room/RoomContext';
import { createRoomStore } from '@/features/room/store';
import type { FakePlayer } from '@/test/FakePlayer';
import { FakeClock } from '@/test/FakePlayer';
import { joinAck, playback } from '@/test/fixtures';
import { AUTOPLAY_DETECT_MS, DRIFT_CHECK_MS, POST_SEEK_COOLDOWN_MS } from '@watchparty/shared';
import { DEFAULT_PLAYER_PREFS, usePlayerPrefs } from './playerPrefs';
import { usePlayerSync } from './usePlayerSync';

const shared = vi.hoisted(() => ({
  clock: null as unknown as FakeClock,
  players: [] as FakePlayer[],
  /** Applied to each new player before it is used. */
  configure: (_player: FakePlayer): void => undefined,
}));

vi.mock('./YouTubePlayerAdapter', async () => {
  const { FakePlayer: Fake } = await import('@/test/FakePlayer');
  class YouTubePlayerAdapter extends Fake {
    constructor() {
      super(shared.clock);
      shared.configure(this);
      shared.players.push(this);
    }
  }
  return { YouTubePlayerAdapter };
});

const flush = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  });
};

const mount = async (roomPlayback = playback({ serverTime: shared.clock.now() })) => {
  const store = createRoomStore();
  store.getState().hydrate(joinAck({ playback: roomPlayback }));
  const value: RoomContextValue = {
    store,
    rpc: vi.fn(() => Promise.resolve({})) as unknown as RoomContextValue['rpc'],
    quietRpc: vi.fn(() => Promise.resolve({})) as unknown as RoomContextValue['quietRpc'],
    clock: shared.clock,
  };
  const container = { current: document.createElement('div') };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
  );
  const hook = renderHook(() => usePlayerSync(container), { wrapper });
  await flush();
  const player = shared.players.at(-1);
  if (player === undefined) {
    throw new Error('player not created');
  }
  return { ...hook, player, store };
};

/** Advance the shared clock and the drift-check interval together. */
const elapse = async (ms: number): Promise<void> => {
  await act(async () => {
    shared.clock.advance(ms);
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
  await flush();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'clearInterval', 'clearTimeout'] });
  shared.clock = new FakeClock();
  shared.players = [];
  shared.configure = () => undefined;
  localStorage.clear();
  usePlayerPrefs.setState({ ...DEFAULT_PLAYER_PREFS });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlayerSync audio', () => {
  it('applies the default volume on ready and does not mute', async () => {
    const { player, result } = await mount();
    expect(player.calls).toContain('volume:100');
    expect(player.calls).not.toContain('mute');
    expect(result.current).toMatchObject({ volume: 100, muted: false });
  });

  it('restores a saved volume and mute choice when the player is ready', async () => {
    usePlayerPrefs.setState({ volume: 30, muted: true });
    const { player, result } = await mount();
    expect(player.calls).toContain('volume:30');
    expect(player.muted).toBe(true);
    expect(result.current).toMatchObject({ volume: 30, muted: true });
  });

  it('changes the volume without touching mute', async () => {
    const { player, result } = await mount();
    act(() => {
      result.current.setVolume(40);
    });
    await flush();
    expect(player.volume).toBe(40);
    expect(usePlayerPrefs.getState().volume).toBe(40);
    expect(player.calls.filter((c) => c === 'mute' || c === 'unmute')).toEqual([]);
  });

  it('clamps out-of-range volumes before they reach the player', async () => {
    const { player, result } = await mount();
    act(() => {
      result.current.setVolume(250);
    });
    expect(player.volume).toBe(100);
    act(() => {
      result.current.setVolume(-3);
    });
    expect(player.volume).toBe(0);
  });

  it('turning the volume up while muted unmutes, like YouTube', async () => {
    usePlayerPrefs.setState({ muted: true });
    const { player, result } = await mount();
    act(() => {
      result.current.setVolume(60);
    });
    await flush();
    expect(player.muted).toBe(false);
    expect(result.current).toMatchObject({ volume: 60, muted: false });
  });

  it('setting the volume to 0 does not count as muting', async () => {
    const { player, result } = await mount();
    act(() => {
      result.current.setVolume(0);
    });
    await flush();
    expect(player.volume).toBe(0);
    expect(result.current.muted).toBe(false);
    expect(player.calls).not.toContain('mute');
  });

  it('mutes and unmutes, remembering the choice', async () => {
    const { player, result } = await mount();
    act(() => {
      result.current.setMuted(true);
    });
    await flush();
    expect(player.muted).toBe(true);
    expect(result.current.muted).toBe(true);
    expect(JSON.parse(localStorage.getItem('watchparty.player') ?? '{}')).toMatchObject({
      state: { muted: true },
    });
    act(() => {
      result.current.setMuted(false);
    });
    await flush();
    expect(player.muted).toBe(false);
    expect(result.current.muted).toBe(false);
  });

  it('unmuting at volume 0 brings the sound back at a usable level', async () => {
    usePlayerPrefs.setState({ volume: 0, muted: true });
    const { player, result } = await mount();
    act(() => {
      result.current.setMuted(false);
    });
    await flush();
    expect(player.volume).toBe(50);
    expect(result.current).toMatchObject({ volume: 50, muted: false });
  });

  it('shows muted while autoplay forced a muted start, and unmutes from there', async () => {
    shared.configure = (p) => {
      p.blockUnmutedAutoplay = true;
    };
    const { player, result } = await mount();
    await elapse(POST_SEEK_COOLDOWN_MS);
    await elapse(Math.max(AUTOPLAY_DETECT_MS, DRIFT_CHECK_MS));
    await elapse(DRIFT_CHECK_MS);
    expect(result.current.status).toBe('muted');
    expect(result.current.muted).toBe(true);
    expect(usePlayerPrefs.getState().muted).toBe(false);

    player.blockUnmutedAutoplay = false;
    act(() => {
      result.current.setMuted(false);
    });
    await flush();
    expect(player.muted).toBe(false);
    expect(result.current.muted).toBe(false);
    expect(result.current.status).toBe('in_sync');
  });

  it('the "click to join" gate keeps a muted viewer muted', async () => {
    usePlayerPrefs.setState({ muted: true });
    shared.configure = (p) => {
      p.blockAllAutoplay = true;
    };
    const { player, result } = await mount();
    await elapse(POST_SEEK_COOLDOWN_MS);
    await elapse(Math.max(AUTOPLAY_DETECT_MS, DRIFT_CHECK_MS));
    await elapse(DRIFT_CHECK_MS);
    expect(result.current.status).toBe('blocked');

    player.blockAllAutoplay = false;
    act(() => {
      result.current.resume();
    });
    await flush();
    expect(player.state).toBe('playing');
    expect(player.muted).toBe(true);
    expect(player.calls).not.toContain('unmute');
  });

  it('a player that rejects volume changes does not break anything', async () => {
    const { player, result } = await mount();
    player.setVolume = () => Promise.reject(new Error('gone'));
    act(() => {
      result.current.setVolume(10);
    });
    await flush();
    expect(usePlayerPrefs.getState().volume).toBe(10);
  });

  it('controls are safe to call after the player is torn down', async () => {
    const { result, unmount, player } = await mount();
    const { setVolume, setMuted, resume } = result.current;
    unmount();
    expect(player.calls).toContain('destroy');
    expect(() => {
      setVolume(20);
      setMuted(true);
      resume();
    }).not.toThrow();
    expect(usePlayerPrefs.getState()).toMatchObject({ volume: 20, muted: true });
  });
});
