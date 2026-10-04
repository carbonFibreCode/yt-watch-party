import { useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import type { Options } from 'react-hotkeys-hook';
import {
  PLAYBACK_RATES,
  SEEK_COALESCE_MS,
  SEEK_STEP_LONG_S,
  SEEK_STEP_S,
  VOLUME_STEP,
} from '@watchparty/shared';
import type { RequestableAction } from '@watchparty/shared';
import { shortcut } from './shortcuts';
import type { ShortcutId } from './shortcuts';
import type { RelativeSeek } from './useRelativeSeek';

interface ShortcutOptions {
  /** Playback shortcuts are staff only (requests by keyboard would be too easy to spam). */
  readonly canControl: boolean;
  readonly hasVideo: boolean;
  readonly playing: boolean;
  /** Video length in seconds, once known. */
  readonly duration: number | null;
  /** The room's current speed. */
  readonly playbackRate: number;
  readonly send: (action: RequestableAction) => Promise<boolean>;
  /** Seeks that add up when repeated quickly (shared with the double-tap gestures). */
  readonly seekTo: RelativeSeek['seekTo'];
  readonly seekBy: RelativeSeek['seekBy'];
  readonly muted: boolean;
  readonly setMuted: (muted: boolean) => void;
  readonly volume: number;
  readonly setVolume: (volume: number) => void;
  readonly immersive: boolean;
  readonly toggleImmersive: () => void;
  readonly exitImmersive: () => void;
  readonly openHelp: () => void;
  readonly toggleTheater: () => void;
}

/** Theater mode only changes the layout on wide screens (Tailwind `lg`), where there is a sidebar. */
export const THEATER_MEDIA = '(min-width: 64rem)';

/**
 * Focus is in a modal (a dialog traps focus), so the page behind it should not react to keys; or
 * in a rich-text editor, which react-hotkeys-hook does not treat as a form field.
 */
const NOT_FOR_PAGE =
  '[role="dialog"], [role="alertdialog"], [contenteditable]:not([contenteditable="false"])';
/** Space/Enter activate these natively; taking the key would break them (e.g. a toast's Approve). */
const ACTIVATES_ON_SPACE =
  'button, a[href], summary, [role="button"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="radio"], [role="option"]';
/** These widgets use the arrow/Home keys themselves (sliders, tabs, menus, lists). */
const USES_ARROWS =
  '[role="slider"], [role="tablist"], [role="menu"], [role="menubar"], [role="listbox"], [role="radiogroup"]';

const targetIn = (event: KeyboardEvent, selector: string): boolean =>
  event.target instanceof Element && event.target.closest(selector) !== null;

/** Shared by every shortcut: never steal keys from dialogs, or from something that handled them. */
const ignoreBase = (event: KeyboardEvent): boolean => event.defaultPrevented || targetIn(event, NOT_FOR_PAGE);

/**
 * YouTube's player shortcuts (plan §15.4 Step 1.9), keyed from the shared SHORTCUTS table. Typing
 * in a field never triggers them (react-hotkeys-hook ignores form fields by default), and keys
 * that the focused control needs for itself (Space on a button, arrows on a slider) are left to it.
 */
export const useKeyboardShortcuts = (o: ShortcutOptions): void => {
  const staff = o.canControl && o.hasVideo;
  const { seekTo, seekBy } = o;
  const options = (id: ShortcutId, enabled: boolean, ignore = ignoreBase): Options => {
    const { useKey } = shortcut(id);
    return {
      enabled,
      preventDefault: true,
      ignoreEventWhen: ignore,
      // `>` is the speed-up key, not react-hotkeys-hook's sequence separator (we use no sequences).
      sequenceSplitKey: '|',
      ...(useKey === undefined ? {} : { useKey }),
    };
  };
  const ignoreSpaceTargets = (event: KeyboardEvent): boolean =>
    ignoreBase(event) || (event.key === ' ' && targetIn(event, ACTIVATES_ON_SPACE));
  const ignoreArrowTargets = (event: KeyboardEvent): boolean =>
    ignoreBase(event) || targetIn(event, USES_ARROWS);

  useHotkeys(
    shortcut('togglePlay').keys,
    () => {
      void o.send({ type: o.playing ? 'pause' : 'play' });
    },
    options('togglePlay', staff, ignoreSpaceTargets),
    [o.send, o.playing],
  );
  useHotkeys(
    shortcut('back10').keys,
    () => {
      seekBy(-SEEK_STEP_LONG_S);
    },
    options('back10', staff),
    [seekBy],
  );
  useHotkeys(
    shortcut('fwd10').keys,
    () => {
      seekBy(SEEK_STEP_LONG_S);
    },
    options('fwd10', staff),
    [seekBy],
  );
  useHotkeys(
    shortcut('back5').keys,
    () => {
      seekBy(-SEEK_STEP_S);
    },
    options('back5', staff, ignoreArrowTargets),
    [seekBy],
  );
  useHotkeys(
    shortcut('fwd5').keys,
    () => {
      seekBy(SEEK_STEP_S);
    },
    options('fwd5', staff, ignoreArrowTargets),
    [seekBy],
  );
  useHotkeys(
    shortcut('jumpPercent').keys,
    (event) => {
      const digit = Number(event.key);
      if (o.duration !== null && Number.isInteger(digit)) {
        seekTo((o.duration * digit) / 10);
      }
    },
    options('jumpPercent', staff && o.duration !== null),
    [seekTo, o.duration],
  );
  useHotkeys(
    shortcut('restart').keys,
    () => {
      seekTo(0);
    },
    options('restart', staff, ignoreArrowTargets),
    [seekTo],
  );

  /** The speed this client last asked for, until the room shows it (rapid > > steps twice). */
  const pendingRate = useRef<{ readonly rate: number; readonly at: number } | null>(null);
  /** Steps to the next standard speed in `direction`; nothing at either end of the list. */
  const stepRate = (direction: 1 | -1): void => {
    const pending = pendingRate.current;
    const base =
      pending !== null && pending.rate !== o.playbackRate && Date.now() - pending.at < SEEK_COALESCE_MS
        ? pending.rate
        : o.playbackRate;
    const index = PLAYBACK_RATES.findIndex((rate) => rate === base);
    const next = PLAYBACK_RATES[(index === -1 ? PLAYBACK_RATES.indexOf(1) : index) + direction];
    if (next !== undefined) {
      pendingRate.current = { rate: next, at: Date.now() };
      void o.send({ type: 'set_rate', rate: next });
    }
  };
  useHotkeys(
    shortcut('speedUp').keys,
    () => {
      stepRate(1);
    },
    options('speedUp', staff),
    [stepRate],
  );
  useHotkeys(
    shortcut('speedDown').keys,
    () => {
      stepRate(-1);
    },
    options('speedDown', staff),
    [stepRate],
  );

  useHotkeys(
    shortcut('mute').keys,
    () => {
      o.setMuted(!o.muted);
    },
    options('mute', true),
    [o.setMuted, o.muted],
  );
  useHotkeys(
    shortcut('volUp').keys,
    () => {
      o.setVolume(o.volume + VOLUME_STEP);
    },
    options('volUp', true, ignoreArrowTargets),
    [o.setVolume, o.volume],
  );
  useHotkeys(
    shortcut('volDown').keys,
    () => {
      o.setVolume(o.volume - VOLUME_STEP);
    },
    options('volDown', true, ignoreArrowTargets),
    [o.setVolume, o.volume],
  );
  useHotkeys(shortcut('fullscreen').keys, o.toggleImmersive, options('fullscreen', true), [
    o.toggleImmersive,
  ]);
  useHotkeys(shortcut('exitFullscreen').keys, o.exitImmersive, options('exitFullscreen', o.immersive), [
    o.exitImmersive,
  ]);
  useHotkeys(shortcut('help').keys, o.openHelp, options('help', true), [o.openHelp]);
  useHotkeys(
    shortcut('theater').keys,
    () => {
      if (window.matchMedia(THEATER_MEDIA).matches) {
        o.toggleTheater();
      }
    },
    options('theater', !o.immersive),
    [o.toggleTheater],
  );
};
