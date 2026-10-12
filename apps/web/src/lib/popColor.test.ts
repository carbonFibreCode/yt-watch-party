import { describe, expect, it } from 'vitest';
import { POP_COLORS, popColorFor } from './popColor';

describe('popColorFor', () => {
  it('is stable for the same name, ignoring case and surrounding spaces', () => {
    expect(popColorFor('Hana')).toBe(popColorFor('hana'));
    expect(popColorFor('  Hana ')).toBe(popColorFor('Hana'));
  });

  it('always returns a palette colour, including for empty and non-Latin names', () => {
    for (const name of ['', 'Ä', '名前', '🎉🎉', 'x'.repeat(500)]) {
      expect(POP_COLORS).toContain(popColorFor(name));
    }
  });

  it('spreads a room of names across the palette', () => {
    const names = ['Hana', 'Sam', 'Pat', 'Mo', 'Vic', 'Lee', 'Ari', 'Kai', 'Noa', 'Zed', 'Ivy', 'Bo'];
    expect(new Set(names.map(popColorFor)).size).toBeGreaterThanOrEqual(4);
  });
});
