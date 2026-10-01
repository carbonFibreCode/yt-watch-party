import { describe, expect, it } from 'vitest';
import { KeyedMutex } from './KeyedMutex';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('KeyedMutex', () => {
  it('serializes work for the same key', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    let release!: () => void;
    const first = mutex.runExclusive('room', async () => {
      order.push('first:start');
      await new Promise<void>((resolve) => (release = resolve));
      order.push('first:end');
    });
    const second = mutex.runExclusive('room', () => {
      order.push('second');
      return Promise.resolve();
    });
    await tick();
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('runs different keys concurrently', async () => {
    const mutex = new KeyedMutex();
    let release!: () => void;
    const blocked = mutex.runExclusive('a', () => new Promise<void>((resolve) => (release = resolve)));
    await expect(mutex.runExclusive('b', () => Promise.resolve('done'))).resolves.toBe('done');
    release();
    await blocked;
  });

  it('releases the lock and forgets the key after failures', async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.runExclusive('room', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(mutex.runExclusive('room', () => Promise.resolve(1))).resolves.toBe(1);
    expect(mutex.activeKeys).toBe(0);
  });
});
