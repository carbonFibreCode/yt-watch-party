import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

const MAX_VOLUME = 100;

export interface PlayerPrefs {
  /** YouTube volume units, 0–100. */
  readonly volume: number;
  /** The viewer chose mute (separate from the engine's autoplay fallback mute). */
  readonly muted: boolean;
  readonly theater: boolean;
}

interface PlayerPrefsActions {
  /** Clamped and rounded; raising the volume above 0 also unmutes, like YouTube. */
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  toggleTheater(): void;
}

export const DEFAULT_PLAYER_PREFS: PlayerPrefs = { volume: MAX_VOLUME, muted: false, theater: false };

export const clampVolume = (volume: number): number =>
  Number.isFinite(volume) ? Math.min(Math.max(Math.round(volume), 0), MAX_VOLUME) : MAX_VOLUME;

/** Stored data is user-editable, so every field is checked and anything invalid falls back. */
const sanitize = (stored: unknown): PlayerPrefs => {
  const value = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  return {
    volume: typeof value.volume === 'number' ? clampVolume(value.volume) : DEFAULT_PLAYER_PREFS.volume,
    muted: typeof value.muted === 'boolean' ? value.muted : DEFAULT_PLAYER_PREFS.muted,
    theater: typeof value.theater === 'boolean' ? value.theater : DEFAULT_PLAYER_PREFS.theater,
  };
};

export const PLAYER_PREFS_KEY = 'watchparty.player';

/** Preferences are a convenience: a full or blocked storage must never break a control. */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Quota exceeded or storage blocked: keep the in-memory value only.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // As above.
    }
  },
};

/**
 * Per-viewer player preferences, remembered in this browser only (plan §15.4 Step 1.3). Never sent
 * to the server. If storage is unavailable (private mode, blocked site data) it works in memory.
 */
export const usePlayerPrefs = create<PlayerPrefs & PlayerPrefsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_PLAYER_PREFS,
      setVolume: (volume) => {
        const next = clampVolume(volume);
        set(next > 0 ? { volume: next, muted: false } : { volume: next });
      },
      setMuted: (muted) => {
        set({ muted });
      },
      toggleTheater: () => {
        set((state) => ({ theater: !state.theater }));
      },
    }),
    {
      name: PLAYER_PREFS_KEY,
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: ({ volume, muted, theater }) => ({ volume, muted, theater }),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    },
  ),
);
