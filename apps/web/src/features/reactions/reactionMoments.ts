import { REACTION_BUCKET_S } from '@watchparty/shared';
import type { ReactionEmoji, ReactionView } from '@watchparty/shared';

export interface ReactionMoment {
  /** Start of the bucket, in seconds. */
  readonly time: number;
  /** The most-used emoji in the bucket (earliest wins ties). */
  readonly emoji: ReactionEmoji;
  readonly count: number;
}

/** Groups reactions into "key moments" for the scrubber, one per REACTION_BUCKET_S bucket. */
export const reactionMoments = (
  reactions: readonly ReactionView[],
  bucketS: number = REACTION_BUCKET_S,
): ReactionMoment[] => {
  const buckets = new Map<number, ReactionView[]>();
  for (const reaction of reactions) {
    const bucket = Math.floor(reaction.videoTime / bucketS) * bucketS;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), reaction]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, inBucket]) => {
      const counts = new Map<ReactionEmoji, number>();
      for (const r of inBucket) {
        counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
      }
      let top: ReactionEmoji = inBucket[0]?.emoji ?? '👍';
      for (const [emoji, count] of counts) {
        if (count > (counts.get(top) ?? 0)) {
          top = emoji;
        }
      }
      return { time, emoji: top, count: inBucket.length };
    });
};
