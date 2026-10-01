import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, RoomCode, ServerToClientEvents } from '@watchparty/shared';
import type { AuthUser } from '../../application/ports';

/** Per-socket state; restored by connection-state recovery after short disconnects. */
export interface SocketData {
  user: AuthUser;
  roomId: RoomCode | null;
}

/** No server-to-server events: cross-instance traffic goes through the adapter only. */
export type InterServerEvents = Record<string, never>;

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
