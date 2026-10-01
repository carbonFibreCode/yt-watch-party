import { describe, expect, it } from 'vitest';
import { RoomCode } from '@watchparty/shared';
import { NanoIdGenerator } from './NanoIdGenerator';

describe('NanoIdGenerator', () => {
  const ids = new NanoIdGenerator();

  it('generates valid, unambiguous room codes', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(RoomCode.safeParse(ids.roomCode()).success).toBe(true);
    }
  });

  it('generates unique ids', () => {
    const generated = new Set(Array.from({ length: 1000 }, () => ids.next()));
    expect(generated.size).toBe(1000);
  });
});
