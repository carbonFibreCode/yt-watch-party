import type { RoomCode, UserId } from '@watchparty/shared';
import type { PresenceProbe } from '../../application/ports';
import { ch } from './channels';
import type { IoServer } from './types';

/** Counts a user's sockets in a room across every server instance (via the adapter). */
export class SocketPresenceProbe implements PresenceProbe {
  constructor(private readonly io: IoServer) {}

  async countSockets(roomId: RoomCode, userId: UserId): Promise<number> {
    return (await this.io.in(ch.user(roomId, userId)).fetchSockets()).length;
  }
}
