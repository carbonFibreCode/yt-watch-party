import type { RoomSummary, UserId } from '@watchparty/shared';
import type { MembershipEntry, MembershipRepository } from '../../application/ports';

export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly byUser = new Map<UserId, Map<string, RoomSummary>>();

  touch({ roomId, userId, roomName, role, at }: MembershipEntry): Promise<void> {
    const rooms = this.byUser.get(userId) ?? new Map<string, RoomSummary>();
    rooms.set(roomId, { roomId, name: roomName, lastRole: role, lastJoinedAt: at });
    this.byUser.set(userId, rooms);
    return Promise.resolve();
  }

  recentForUser(userId: UserId, limit: number): Promise<readonly RoomSummary[]> {
    const rooms = [...(this.byUser.get(userId)?.values() ?? [])];
    return Promise.resolve(rooms.sort((a, b) => b.lastJoinedAt - a.lastJoinedAt).slice(0, limit));
  }

  reassign(fromUserId: UserId, toUserId: UserId): Promise<void> {
    const from = this.byUser.get(fromUserId);
    if (from !== undefined) {
      const to = this.byUser.get(toUserId) ?? new Map<string, RoomSummary>();
      for (const [roomId, summary] of from) {
        const existing = to.get(roomId);
        if (existing === undefined || existing.lastJoinedAt < summary.lastJoinedAt) {
          to.set(roomId, summary);
        }
      }
      this.byUser.set(toUserId, to);
      this.byUser.delete(fromUserId);
    }
    return Promise.resolve();
  }
}
