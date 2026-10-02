import { HOT_ROOM_TTL_S } from '@watchparty/shared';
import type { RoomCode } from '@watchparty/shared';
import type { RoomRepository } from '../../application/ports';
import { DomainError } from '../../domain/DomainError';
import type { RoomSnapshot } from '../../domain/snapshot';
import type { RedisClient } from '../redis/client';
import { LuaScript } from '../redis/LuaScript';
import { RoomSnapshotCodec } from './RoomSnapshotCodec';

/** KEYS[1] room hash · ARGV: version, json, ttl. Creates only if absent. */
const CREATE = new LuaScript(`
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'v', ARGV[1], 'data', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`);

/** KEYS[1] room hash · ARGV: expected version, new version, json, ttl. Atomic compare-and-set. */
const COMPARE_AND_SET = new LuaScript(`
if redis.call('HGET', KEYS[1], 'v') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'v', ARGV[2], 'data', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
`);

/**
 * Room store shared by every instance (LLD SP-6, SP-19). Each room is a hash holding its version
 * next to the encoded snapshot, so the CAS script compares versions without decoding JSON.
 * Rooms idle for HOT_ROOM_TTL_S expire (reads and writes refresh the TTL); the Tiered decorator
 * reads them back from Postgres.
 */
export class RedisRoomRepository implements RoomRepository {
  constructor(
    private readonly redis: RedisClient,
    private readonly keyPrefix = 'wp:room:',
    private readonly ttlS: number = HOT_ROOM_TTL_S,
  ) {}

  async create(snapshot: RoomSnapshot): Promise<void> {
    const created = await CREATE.run(
      this.redis,
      [this.key(snapshot.id)],
      [String(snapshot.version), RoomSnapshotCodec.encode(snapshot), String(this.ttlS)],
    );
    if (created !== 1) {
      throw new DomainError('CONFLICT');
    }
  }

  async load(id: RoomCode): Promise<RoomSnapshot | null> {
    const key = this.key(id);
    const [json] = await Promise.all([this.redis.hGet(key, 'data'), this.redis.expire(key, this.ttlS)]);
    return json === null ? null : RoomSnapshotCodec.decode(json);
  }

  async compareAndSet(snapshot: RoomSnapshot, expectedVersion: number): Promise<boolean> {
    const committed = await COMPARE_AND_SET.run(
      this.redis,
      [this.key(snapshot.id)],
      [
        String(expectedVersion),
        String(snapshot.version),
        RoomSnapshotCodec.encode(snapshot),
        String(this.ttlS),
      ],
    );
    return committed === 1;
  }

  private key(id: RoomCode): string {
    return `${this.keyPrefix}${id}`;
  }
}
