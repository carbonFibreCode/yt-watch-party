import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@watchparty/shared';

export type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * One Socket.IO connection to the same origin (LLD SP-14). WebSocket only, so no sticky sessions;
 * created disconnected so listeners are bound before the first packet.
 */
export const createSocket = (): RoomSocket =>
  io({ transports: ['websocket'], autoConnect: false, withCredentials: true });
