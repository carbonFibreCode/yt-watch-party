import { describe, expect, it } from 'vitest';
import type { ReactionEmoji, ReactionView } from '@watchparty/shared';
import { reactionMoments } from './reactionMoments';

let id = 0;
const reaction = (emoji: ReactionEmoji, videoTime: number): ReactionView => {
  id += 1;
  return { id: String(id), userId: 'u', name: 'u', emoji, videoTime, at: 0 };
};

describe('reactionMoments', () => {
  it('groups reactions into time buckets, in order', () => {
    expect(reactionMoments([reaction('🔥', 12), reaction('😂', 3), reaction('🔥', 14.9)])).toEqual([
      { time: 0, emoji: '😂', count: 1 },
      { time: 10, emoji: '🔥', count: 2 },
    ]);
  });

  it('shows the most-used emoji of a bucket, earliest winning ties', () => {
    expect(reactionMoments([reaction('😂', 1), reaction('🔥', 2), reaction('🔥', 3)])).toEqual([
      { time: 0, emoji: '🔥', count: 3 },
    ]);
    expect(reactionMoments([reaction('😂', 1), reaction('🔥', 2)])[0]?.emoji).toBe('😂');
  });

  it('returns nothing without reactions', () => {
    expect(reactionMoments([])).toEqual([]);
  });
});
