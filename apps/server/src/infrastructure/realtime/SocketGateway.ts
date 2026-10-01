import type { CommandRegistry } from '../../application/commands/CommandRegistry';
import type { Logger, SessionResolver } from '../../application/ports';
import type { PresenceService } from '../../application/PresenceService';
import { SocketSession } from './SocketSession';
import type { IoServer, IoSocket } from './types';

type Ack = (result: unknown) => void;

const isAck = (value: unknown): value is Ack => typeof value === 'function';

export interface SocketGatewayDeps {
  readonly io: IoServer;
  readonly registry: CommandRegistry;
  readonly presence: PresenceService;
  readonly sessions: SessionResolver;
  readonly logger: Logger;
}

/**
 * Socket.IO edge (LLD SP-2, SP-7, SP-9): authenticates the handshake, forwards every event to the
 * command registry and acks the result, and reports connection lifecycle to PresenceService.
 */
export class SocketGateway {
  constructor(private readonly deps: SocketGatewayDeps) {}

  start(): void {
    const { io } = this.deps;
    io.use((socket, next) => {
      this.authenticate(socket).then(
        () => {
          next();
        },
        (error: unknown) => {
          this.deps.logger.warn({ err: error }, 'socket authentication failed');
          next(new Error('UNAUTHENTICATED'));
        },
      );
    });
    io.on('connection', (socket) => {
      this.onConnection(socket);
    });
  }

  private async authenticate(socket: IoSocket): Promise<void> {
    const user = await this.deps.sessions.resolve(socket.request.headers);
    if (user === null) {
      throw new Error('no session');
    }
    socket.data.user = user;
    socket.data.roomId = null;
  }

  private onConnection(socket: IoSocket): void {
    const session = new SocketSession(socket);
    const log = this.deps.logger.child({ socketId: socket.id, userId: session.user.userId });

    if (socket.recovered) {
      this.deps.presence.onRecovered(session).catch((error: unknown) => {
        log.error({ err: error }, 'recovery failed');
      });
    }

    socket.onAny((event: string, ...args: unknown[]) => {
      const [payload, ack] = args;
      if (!isAck(ack)) {
        log.debug({ event }, 'ignored event without acknowledgement');
        return;
      }
      this.deps.registry.dispatch(event, payload, session).then(ack, (error: unknown) => {
        log.error({ err: error, event }, 'dispatch failed');
      });
    });

    socket.on('disconnect', (reason) => {
      log.debug({ reason, roomId: session.roomId }, 'socket disconnected');
      this.deps.presence.onDisconnect(session).catch((error: unknown) => {
        log.error({ err: error }, 'disconnect handling failed');
      });
    });
  }
}
