import { describe, expect, it } from 'vitest';
import { SystemClock } from './SystemClock';

describe('SystemClock', () => {
  it('reads wall-clock time', () => {
    const before = Date.now();
    const now = new SystemClock().now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
