import { PermissionPolicy } from '@watchparty/shared';
import type { Role, RoomCode } from '@watchparty/shared';
import type { AuthUser, RealtimeSession } from '../../application/ports';
import { ch } from './channels';
import type { IoSocket } from './types';

/** RealtimeSession over one Socket.IO socket: channel membership + socket.data (LLD SP-7). */
export class SocketSession implements RealtimeSession {
  constructor(private readonly socket: IoSocket) {}

  get user(): AuthUser {
    return this.socket.data.user;
  }

  get roomId(): RoomCode | null {
    return this.socket.data.roomId;
  }

  async attach(roomId: RoomCode, role: Role): Promise<void> {
    const { userId } = this.user;
    await this.socket.join([ch.room(roomId), ch.user(roomId, userId)]);
    if (PermissionPolicy.isStaff(role)) {
      await this.socket.join(ch.staff(roomId));
    } else {
      await this.socket.leave(ch.staff(roomId));
    }
    this.socket.data.roomId = roomId;
  }

  async detach(): Promise<void> {
    const { roomId } = this;
    if (roomId === null) {
      return;
    }
    for (const channel of [ch.room(roomId), ch.staff(roomId), ch.user(roomId, this.user.userId)]) {
      await this.socket.leave(channel);
    }
    this.socket.data.roomId = null;
  }
}
