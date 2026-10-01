import type { JoinRoomAck, RoomCode } from '@watchparty/shared';
import type { ChatService } from './ChatService';
import type { Broadcaster, Clock, MembershipRepository, PresenceProbe, RealtimeSession } from './ports';
import { RoomPresenter } from './RoomPresenter';
import type { RoomService } from './RoomService';

/**
 * Joining and leaving rooms (LLD SP-7 JoinRoom/LeaveRoom, SP-9). Shared by the join/leave
 * commands and the presence lifecycle so there is one implementation of each transition.
 */
export class MembershipService {
  constructor(
    private readonly rooms: RoomService,
    private readonly memberships: MembershipRepository,
    private readonly chat: ChatService,
    private readonly broadcaster: Broadcaster,
    private readonly presence: PresenceProbe,
    private readonly clock: Clock,
  ) {}

  async join(session: RealtimeSession, roomId: RoomCode): Promise<JoinRoomAck> {
    if (session.roomId !== null && session.roomId !== roomId) {
      await this.leave(session);
    }
    const { user } = session;
    const { result, room, events } = await this.rooms.mutate(roomId, (r, now) => r.join(user, now));
    const { role } = result.participant;
    await session.attach(roomId, role);
    await this.memberships.touch({
      roomId,
      userId: user.userId,
      roomName: room.name,
      role,
      at: this.clock.now(),
    });
    await this.broadcaster.publish(room, events);
    return {
      room: RoomPresenter.roomView(room, user.userId, this.clock.now()),
      chatHistory: await this.chat.history(roomId),
    };
  }

  /** Detaches this socket; the user only leaves the room once their last socket has gone. */
  async leave(session: RealtimeSession): Promise<void> {
    const roomId = session.roomId;
    if (roomId === null) {
      return;
    }
    const { userId } = session.user;
    await session.detach();
    if ((await this.presence.countSockets(roomId, userId)) > 0) {
      return;
    }
    const { room, events } = await this.rooms.mutate(roomId, (r) => {
      if (r.participant(userId) !== undefined) {
        r.leave(userId);
      }
    });
    await this.broadcaster.publish(room, events);
  }
}
