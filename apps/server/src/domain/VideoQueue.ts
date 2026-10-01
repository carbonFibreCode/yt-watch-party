import { QUEUE_MAX } from '@watchparty/shared';
import type { UserRef } from '@watchparty/shared';
import { DomainError } from './DomainError';
import type { VideoRef } from './VideoRef';

export interface QueueItem {
  readonly id: string;
  readonly video: VideoRef;
  readonly addedBy: UserRef;
}

/** Ordered list of upcoming videos (LLD SP-16). */
export class VideoQueue {
  private constructor(private items: readonly QueueItem[]) {}

  static empty(): VideoQueue {
    return new VideoQueue([]);
  }

  static fromSnapshot(items: readonly QueueItem[]): VideoQueue {
    return new VideoQueue([...items]);
  }

  toSnapshot(): readonly QueueItem[] {
    return this.items;
  }

  list(): readonly QueueItem[] {
    return this.items;
  }

  get size(): number {
    return this.items.length;
  }

  add(item: QueueItem): void {
    if (this.items.length >= QUEUE_MAX) {
      throw new DomainError('QUEUE_FULL');
    }
    this.items = [...this.items, item];
  }

  remove(itemId: string): QueueItem {
    const item = this.items.find((candidate) => candidate.id === itemId);
    if (item === undefined) {
      throw new DomainError('TARGET_NOT_FOUND');
    }
    this.items = this.items.filter((candidate) => candidate.id !== itemId);
    return item;
  }

  shift(): QueueItem | undefined {
    const [first, ...rest] = this.items;
    this.items = rest;
    return first;
  }
}
