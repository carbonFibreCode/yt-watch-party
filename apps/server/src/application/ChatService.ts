import { CHAT_HISTORY_LIMIT } from '@watchparty/shared';
import type { ChatMessageView, RoomCode } from '@watchparty/shared';
import type { Participant } from '../domain/Participant';
import type { Broadcaster, ChatMessage, ChatRepository, Clock, IdGenerator } from './ports';
import { RoomPresenter } from './RoomPresenter';

/** Persisted room chat (LLD SP-15). Outside the Room aggregate: no CAS contention with playback. */
export class ChatService {
  constructor(
    private readonly repository: ChatRepository,
    private readonly broadcaster: Broadcaster,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async post(roomId: RoomCode, author: Participant, text: string): Promise<void> {
    const message: ChatMessage = {
      id: this.ids.next(),
      roomId,
      user: { userId: author.userId, name: author.name, role: author.role },
      text,
      createdAt: this.clock.now(),
    };
    await this.repository.append(message);
    this.broadcaster.toRoom(roomId, 'chat_message', RoomPresenter.chatMessage(message));
  }

  async history(roomId: RoomCode): Promise<ChatMessageView[]> {
    const messages = await this.repository.recent(roomId, CHAT_HISTORY_LIMIT);
    return messages.map(RoomPresenter.chatMessage);
  }
}
