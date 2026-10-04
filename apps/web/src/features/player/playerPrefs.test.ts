import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampVolume, DEFAULT_PLAYER_PREFS, PLAYER_PREFS_KEY, usePlayerPrefs } from './playerPrefs';

const stored = (): unknown => JSON.parse(localStorage.getItem(PLAYER_PREFS_KEY) ?? 'null');

const rehydrateFrom = async (raw: string): Promise<void> => {
  localStorage.setItem(PLAYER_PREFS_KEY, raw);
  await usePlayerPrefs.persist.rehydrate();
};

beforeEach(() => {
  localStorage.clear();
  usePlayerPrefs.setState({ ...DEFAULT_PLAYER_PREFS });
});

describe('clampVolume', () => {
  it.each([
    [50, 50],
    [0, 0],
    [100, 100],
    [-5, 0],
    [150, 100],
    [33.4, 33],
    [33.5, 34],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
    [Number.NEGATIVE_INFINITY, 100],
  ])('%s → %s', (input, expected) => {
    expect(clampVolume(input)).toBe(expected);
  });
});

describe('usePlayerPrefs', () => {
  it('starts at full volume, unmuted, default view', () => {
    const { volume, muted, theater } = usePlayerPrefs.getState();
    expect({ volume, muted, theater }).toEqual({ volume: 100, muted: false, theater: false });
  });

  it('clamps volume and remembers it', () => {
    usePlayerPrefs.getState().setVolume(140);
    expect(usePlayerPrefs.getState().volume).toBe(100);
    usePlayerPrefs.getState().setVolume(-1);
    expect(usePlayerPrefs.getState().volume).toBe(0);
    usePlayerPrefs.getState().setVolume(42.2);
    expect(usePlayerPrefs.getState().volume).toBe(42);
    expect(stored()).toMatchObject({ state: { volume: 42 } });
  });

  it('raising the volume unmutes; setting it to 0 leaves mute alone', () => {
    usePlayerPrefs.getState().setMuted(true);
    usePlayerPrefs.getState().setVolume(0);
    expect(usePlayerPrefs.getState().muted).toBe(true);
    usePlayerPrefs.getState().setVolume(30);
    expect(usePlayerPrefs.getState()).toMatchObject({ volume: 30, muted: false });
  });

  it('mute keeps the volume so unmuting restores it', () => {
    usePlayerPrefs.getState().setVolume(25);
    usePlayerPrefs.getState().setMuted(true);
    usePlayerPrefs.getState().setMuted(false);
    expect(usePlayerPrefs.getState()).toMatchObject({ volume: 25, muted: false });
  });

  it('toggles theater', () => {
    usePlayerPrefs.getState().toggleTheater();
    expect(usePlayerPrefs.getState().theater).toBe(true);
    usePlayerPrefs.getState().toggleTheater();
    expect(usePlayerPrefs.getState().theater).toBe(false);
  });

  it('stores only the data fields, never the actions', () => {
    usePlayerPrefs.getState().setMuted(true);
    expect(stored()).toEqual({ state: { volume: 100, muted: true, theater: false }, version: 1 });
  });

  it('restores saved preferences on load', async () => {
    await rehydrateFrom(JSON.stringify({ state: { volume: 12, muted: true, theater: true }, version: 1 }));
    expect(usePlayerPrefs.getState()).toMatchObject({ volume: 12, muted: true, theater: true });
  });

  it.each([
    ['wrong types', { volume: '50', muted: 'yes', theater: 1 }],
    ['nulls', { volume: null, muted: null, theater: null }],
    ['an array', [1, 2, 3]],
    ['a string', 'loud'],
    ['nothing', null],
  ])('falls back to defaults for stored %s', async (_label, state) => {
    await rehydrateFrom(JSON.stringify({ state, version: 1 }));
    expect(usePlayerPrefs.getState()).toMatchObject(DEFAULT_PLAYER_PREFS);
  });

  it('keeps valid fields and replaces only the invalid ones', async () => {
    await rehydrateFrom(JSON.stringify({ state: { volume: 999, muted: true, theater: 'x' }, version: 1 }));
    expect(usePlayerPrefs.getState()).toMatchObject({ volume: 100, muted: true, theater: false });
  });

  it('survives stored data that is not JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await rehydrateFrom('{not json');
    expect(usePlayerPrefs.getState()).toMatchObject(DEFAULT_PLAYER_PREFS);
    usePlayerPrefs.getState().setVolume(10);
    expect(usePlayerPrefs.getState().volume).toBe(10);
    warn.mockRestore();
  });
});

describe('usePlayerPrefs without storage', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');

  afterEach(() => {
    if (original !== undefined) {
      Object.defineProperty(window, 'localStorage', original);
    }
    vi.resetModules();
  });

  it('works in memory when the browser blocks storage', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    vi.resetModules();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { usePlayerPrefs: fresh } = await import('./playerPrefs');
    expect(fresh.getState().volume).toBe(100);
    fresh.getState().setVolume(20);
    fresh.getState().setMuted(true);
    expect(fresh.getState()).toMatchObject({ volume: 20, muted: true });
    warn.mockRestore();
  });

  it('works when writes fail (storage full)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => {
      usePlayerPrefs.getState().setVolume(60);
    }).not.toThrow();
    expect(usePlayerPrefs.getState().volume).toBe(60);
    setItem.mockRestore();
  });
});
