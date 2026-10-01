import { describe, expect, it } from 'vitest';
import { QUEUE_MAX } from '@watchparty/shared';
import { DomainError } from './DomainError';
import { HOST, video } from './test/builders';
import { VideoQueue } from './VideoQueue';
import type { QueueItem } from './VideoQueue';

const item = (id: string): QueueItem => ({ id, video: video(), addedBy: HOST });

describe('VideoQueue', () => {
  it('keeps insertion order and shifts from the front', () => {
    const queue = VideoQueue.empty();
    queue.add(item('a'));
    queue.add(item('b'));
    expect(queue.shift()?.id).toBe('a');
    expect(queue.list().map((i) => i.id)).toEqual(['b']);
  });

  it('returns undefined when shifting an empty queue', () => {
    expect(VideoQueue.empty().shift()).toBeUndefined();
  });

  it('removes by id', () => {
    const queue = VideoQueue.fromSnapshot([item('a'), item('b'), item('c')]);
    expect(queue.remove('b').id).toBe('b');
    expect(queue.list().map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('rejects removing an unknown item', () => {
    expect(() => VideoQueue.empty().remove('nope')).toThrow(new DomainError('TARGET_NOT_FOUND'));
  });

  it(`rejects more than ${String(QUEUE_MAX)} items with QUEUE_FULL`, () => {
    const queue = VideoQueue.fromSnapshot(Array.from({ length: QUEUE_MAX }, (_, i) => item(String(i))));
    expect(queue.size).toBe(QUEUE_MAX);
    expect(() => {
      queue.add(item('overflow'));
    }).toThrow(new DomainError('QUEUE_FULL'));
  });

  it('does not alias the snapshot it was built from', () => {
    const source = [item('a')];
    const queue = VideoQueue.fromSnapshot(source);
    queue.add(item('b'));
    expect(source).toHaveLength(1);
    expect(queue.toSnapshot()).toHaveLength(2);
  });
});
