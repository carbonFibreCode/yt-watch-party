/** Who a shortcut works for: local ones for everyone, playback ones for staff only. */
export type ShortcutScope = 'everyone' | 'staff';

export interface Shortcut {
  readonly id: ShortcutId;
  /** react-hotkeys-hook syntax; several keys are comma-separated. */
  readonly keys: string;
  /** How the keys are shown in the help dialog. */
  readonly display: readonly string[];
  readonly label: string;
  readonly scope: ShortcutScope;
  /** Match the produced character instead of the physical key (for shifted symbols like `?`). */
  readonly useKey?: boolean;
}

export type ShortcutId =
  | 'togglePlay'
  | 'back10'
  | 'fwd10'
  | 'back5'
  | 'fwd5'
  | 'jumpPercent'
  | 'restart'
  | 'mute'
  | 'volUp'
  | 'volDown'
  | 'fullscreen'
  | 'exitFullscreen'
  | 'theater'
  | 'speedUp'
  | 'speedDown'
  | 'help';

/**
 * The single list of player shortcuts (YouTube's key map), used by both the keyboard hook and the
 * help dialog so they can never disagree (plan §15.4 Step 1.8).
 */
export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'togglePlay', keys: 'space, k', display: ['Space', 'K'], label: 'Play or pause', scope: 'staff' },
  { id: 'back10', keys: 'j', display: ['J'], label: 'Jump back 10 seconds', scope: 'staff' },
  { id: 'fwd10', keys: 'l', display: ['L'], label: 'Jump forward 10 seconds', scope: 'staff' },
  { id: 'back5', keys: 'left', display: ['←'], label: 'Jump back 5 seconds', scope: 'staff' },
  { id: 'fwd5', keys: 'right', display: ['→'], label: 'Jump forward 5 seconds', scope: 'staff' },
  {
    id: 'jumpPercent',
    keys: '0, 1, 2, 3, 4, 5, 6, 7, 8, 9',
    display: ['0', '…', '9'],
    label: 'Jump to 0 %–90 % of the video',
    scope: 'staff',
  },
  { id: 'restart', keys: 'home', display: ['Home'], label: 'Jump to the start', scope: 'staff' },
  {
    id: 'speedUp',
    keys: '>',
    display: ['>'],
    label: 'Faster (for everyone)',
    scope: 'staff',
    useKey: true,
  },
  {
    id: 'speedDown',
    keys: '<',
    display: ['<'],
    label: 'Slower (for everyone)',
    scope: 'staff',
    useKey: true,
  },
  { id: 'mute', keys: 'm', display: ['M'], label: 'Mute or unmute', scope: 'everyone' },
  { id: 'volUp', keys: 'up', display: ['↑'], label: 'Volume up', scope: 'everyone' },
  { id: 'volDown', keys: 'down', display: ['↓'], label: 'Volume down', scope: 'everyone' },
  { id: 'fullscreen', keys: 'f', display: ['F'], label: 'Full screen', scope: 'everyone' },
  { id: 'exitFullscreen', keys: 'escape', display: ['Esc'], label: 'Exit full screen', scope: 'everyone' },
  { id: 'theater', keys: 't', display: ['T'], label: 'Theater mode (wide screens)', scope: 'everyone' },
  {
    id: 'help',
    keys: '?',
    display: ['?'],
    label: 'Show keyboard shortcuts',
    scope: 'everyone',
    useKey: true,
  },
];

export const shortcut = (id: ShortcutId): Shortcut => {
  const found = SHORTCUTS.find((s) => s.id === id);
  if (found === undefined) {
    throw new Error(`Unknown shortcut ${id}`);
  }
  return found;
};
