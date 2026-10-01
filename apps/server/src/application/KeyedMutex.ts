import { Mutex } from 'async-mutex';

/**
 * Serializes work per key (per room) inside one process, so optimistic CAS conflicts only
 * happen between instances, never between two events handled by the same one (LLD SP-6).
 */
export class KeyedMutex {
  private readonly mutexes = new Map<string, Mutex>();

  async runExclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    let mutex = this.mutexes.get(key);
    if (mutex === undefined) {
      mutex = new Mutex();
      this.mutexes.set(key, mutex);
    }
    try {
      return await mutex.runExclusive(work);
    } finally {
      if (!mutex.isLocked()) {
        this.mutexes.delete(key);
      }
    }
  }

  /** Number of keys currently holding a lock or with waiters (used to prove there is no leak). */
  get activeKeys(): number {
    return this.mutexes.size;
  }
}
