import type { RoomCode } from '@watchparty/shared';
import type { ChatMessage, ChatRepository } from '../../application/ports';

export class InMemoryChatRepository implements ChatRepository {
  private readonly messages = new Map<RoomCode, ChatMessage[]>();

  append(message: ChatMessage): Promise<void> {
    const list = this.messages.get(message.roomId) ?? [];
    list.push(message);
    this.messages.set(message.roomId, list);
    return Promise.resolve();
  }

  recent(roomId: RoomCode, limit: number): Promise<readonly ChatMessage[]> {
    return Promise.resolve((this.messages.get(roomId) ?? []).slice(-limit));
  }
}
