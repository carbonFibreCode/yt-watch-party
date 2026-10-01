import { describe, expect, it } from 'vitest';
import { formatDuration, initials, roleLabel, timeAgo } from './format';

describe('format', () => {
  it.each([
    ['Hana', 'HA'],
    ['Hana Mori', 'HM'],
    ['  ada   lovelace king ', 'AK'],
    ['Z', 'Z'],
    ['   ', '?'],
  ])('initials(%j) = %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it('labels roles', () => {
    expect(roleLabel('moderator')).toBe('Moderator');
  });

  it.each([
    [0, 'just now'],
    [59_000, 'just now'],
    [5 * 60_000, '5 minutes ago'],
    [3 * 3_600_000, '3 hours ago'],
    [86_400_000, 'yesterday'],
  ])('timeAgo(%i ms) = %s', (elapsed, expected) => {
    expect(timeAgo(1_000_000_000 - elapsed, 1_000_000_000)).toBe(expected);
  });

  it.each([
    [0, '0:00'],
    [75.9, '1:15'],
    [3725, '1:02:05'],
    [-4, '0:00'],
  ])('formatDuration(%d) = %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
