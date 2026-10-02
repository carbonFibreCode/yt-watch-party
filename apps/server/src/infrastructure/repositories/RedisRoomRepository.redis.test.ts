import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Room } from '../../domain/Room';
import { connectTestRedis } from '../../test/redis/testRedis';
import type { TestRedis } from '../../test/redis/testRedis';
import { RedisRoomRepository } from './RedisRoomRepository';
import { describeRoomRepository } from './test/roomRepositoryContract';

let t: TestRedis;
let stores = 0;

beforeAll(async () => {
  t = await connectTestRedis();
});

afterAll(async () => {
  await t.close();
});

/** A fresh, empty store per test: same connection, its own key namespace. */
const freshRepository = (ttlS?: number): RedisRoomRepository => {
  stores += 1;
  return new RedisRoomRepository(t.redis, `${t.prefix}${String(stores)}:room:`, ttlS);
};

describeRoomRepository('RedisRoomRepository', () => freshRepository());

const snapshot = () =>
  Room.create({ id: 'K7M2QX', name: 'Redis room', host: { userId: 'u', name: 'U' }, now: 1 }).toSnapshot();

describe('RedisRoomRepository', () => {
  it('stores the version next to the snapshot so CAS never decodes JSON', async () => {
    const repo = freshRepository();
    await repo.create(snapshot());
    const keys = await t.redis.keys(`${t.prefix}${String(stores)}:room:*`);
    expect(keys).toHaveLength(1);
    expect(await t.redis.hGet(keys[0]!, 'v')).toBe('0');
  });

  it('expires idle rooms and refreshes the TTL on every read and write', async () => {
    const ttlS = 600;
    const repo = freshRepository(ttlS);
    await repo.create(snapshot());
    const [key] = await t.redis.keys(`${t.prefix}${String(stores)}:room:*`);
    await t.redis.expire(key!, 5);
    await repo.load('K7M2QX');
    expect(await t.redis.ttl(key!)).toBeGreaterThan(ttlS - 5);
    await t.redis.expire(key!, 5);
    await repo.compareAndSet({ ...snapshot(), version: 1 }, 0);
    expect(await t.redis.ttl(key!)).toBeGreaterThan(ttlS - 5);
  });

  it('reloads its scripts after Redis forgets them', async () => {
    const repo = freshRepository();
    await repo.create(snapshot());
    await t.redis.scriptFlush();
    expect(await repo.compareAndSet({ ...snapshot(), version: 1 }, 0)).toBe(true);
    expect((await repo.load('K7M2QX'))?.version).toBe(1);
  });

  it('lets exactly one of many concurrent writers win a version', async () => {
    const repo = freshRepository();
    await repo.create(snapshot());
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        repo.compareAndSet({ ...snapshot(), name: `w${String(i)}`, version: 1 }, 0),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
