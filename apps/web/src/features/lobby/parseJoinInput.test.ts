import { describe, expect, it } from 'vitest';
import { parseJoinInput } from './parseJoinInput';

describe('parseJoinInput', () => {
  it.each([
    ['a code', 'K7M2QX', 'K7M2QX'],
    ['a lowercase code with spaces', '  k7m2qx ', 'K7M2QX'],
    ['an invite link', 'https://watch.example.com/r/K7M2QX', 'K7M2QX'],
    ['a link with a query and hash', 'http://localhost:5173/r/k7m2qx?ref=chat#top', 'K7M2QX'],
  ])('accepts %s', (_label, input, expected) => {
    expect(parseJoinInput(input)).toBe(expected);
  });

  it.each([
    ['empty input', ''],
    ['an ambiguous code', 'K7M0OX'],
    ['a link without a room', 'https://watch.example.com/'],
    ['a link with a bad code', 'https://watch.example.com/r/nope'],
  ])('rejects %s', (_label, input) => {
    expect(parseJoinInput(input)).toBeNull();
  });
});
