import { desc, eq } from 'drizzle-orm';
import { Role } from '@watchparty/shared';
import type { RoomCode } from '@watchparty/shared';
import type { ChatMessage, ChatRepository } from '../../application/ports';
import type { Db } from '../db/client';
import { chatMessages } from '../db/schema';

export class PgChatRepository implements ChatRepository {
  constructor(private readonly db: Db) {}

  async append(message: ChatMessage): Promise<void> {
    await this.db.insert(chatMessages).values({
      id: message.id,
      roomId: message.roomId,
      userId: message.user.userId,
      userName: message.user.name,
      userRole: message.user.role,
      text: message.text,
      createdAt: new Date(message.createdAt),
    });
  }

  async recent(roomId: RoomCode, limit: number): Promise<readonly ChatMessage[]> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.roomId, roomId))
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(limit);
    return rows.reverse().map((row) => ({
      id: row.id,
      roomId,
      user: { userId: row.userId, name: row.userName, role: Role.parse(row.userRole) },
      text: row.text,
      createdAt: row.createdAt.getTime(),
    }));
  }
}
