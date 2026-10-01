import type { Role } from '@watchparty/shared';

const ROLE_LABEL: Readonly<Record<Role, string>> = {
  host: 'Host',
  moderator: 'Moderator',
  participant: 'Participant',
  viewer: 'Viewer',
};

/** Display label for a role ("Moderator"). */
export const roleLabel = (role: Role): string => ROLE_LABEL[role];

/** Two-letter avatar initials from a display name. */
export const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}` : name.trim().slice(0, 2);
  return letters.toUpperCase() || '?';
};

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "5 minutes ago", "yesterday", "just now". */
export const timeAgo = (at: number, now: number): string => {
  const elapsed = now - at;
  for (const [unit, ms] of UNITS) {
    if (elapsed >= ms) {
      return relativeFormat.format(-Math.floor(elapsed / ms), unit);
    }
  }
  return 'just now';
};

/** 75 → "1:15", 3725 → "1:02:05". */
export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${String(h)}:${String(m).padStart(2, '0')}:${s}` : `${String(m)}:${s}`;
};
