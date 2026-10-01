import { desc, eq, sql } from 'drizzle-orm';
import { Role } from '@watchparty/shared';
import type { RoomSummary, UserId } from '@watchparty/shared';
import type { MembershipEntry, MembershipRepository } from '../../application/ports';
import type { Db } from '../db/client';
import { roomMemberships, rooms } from '../db/schema';

export class PgMembershipRepository implements MembershipRepository {
  constructor(private readonly db: Db) {}

  async touch({ roomId, userId, role, at }: MembershipEntry): Promise<void> {
    const lastJoinedAt = new Date(at);
    await this.db
      .insert(roomMemberships)
      .values({ roomId, userId, lastRole: role, lastJoinedAt })
      .onConflictDoUpdate({
        target: [roomMemberships.roomId, roomMemberships.userId],
        set: { lastRole: role, lastJoinedAt },
      });
  }

  async recentForUser(userId: UserId, limit: number): Promise<readonly RoomSummary[]> {
    const rows = await this.db
      .select({
        roomId: roomMemberships.roomId,
        name: rooms.name,
        lastRole: roomMemberships.lastRole,
        lastJoinedAt: roomMemberships.lastJoinedAt,
      })
      .from(roomMemberships)
      .innerJoin(rooms, eq(rooms.id, roomMemberships.roomId))
      .where(eq(roomMemberships.userId, userId))
      .orderBy(desc(roomMemberships.lastJoinedAt))
      .limit(limit);
    return rows.map((row) => ({
      roomId: row.roomId,
      name: row.name,
      lastRole: Role.parse(row.lastRole),
      lastJoinedAt: row.lastJoinedAt.getTime(),
    }));
  }

  /** Merges a guest's history into the account it was linked to, keeping the newest entry per room. */
  async reassign(fromUserId: UserId, toUserId: UserId): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into ${roomMemberships} (room_id, user_id, last_role, last_joined_at)
        select room_id, ${toUserId}, last_role, last_joined_at
        from ${roomMemberships} where user_id = ${fromUserId}
        on conflict (room_id, user_id) do update set
          last_role = case when excluded.last_joined_at > ${roomMemberships.lastJoinedAt}
                           then excluded.last_role else ${roomMemberships.lastRole} end,
          last_joined_at = greatest(excluded.last_joined_at, ${roomMemberships.lastJoinedAt})
      `);
      await tx.delete(roomMemberships).where(eq(roomMemberships.userId, fromUserId));
    });
  }
}
