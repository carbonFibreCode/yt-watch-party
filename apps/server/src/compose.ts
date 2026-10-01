import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { RequestHandler } from 'express';
import type { Logger as PinoLogger } from 'pino';
import { Server } from 'socket.io';
import { MAX_HTTP_BUFFER_BYTES, RECOVERY_WINDOW_MS } from '@watchparty/shared';
import { ChatService } from './application/ChatService';
import { CommandPipeline } from './application/commands/CommandPipeline';
import { CommandRegistry } from './application/commands/CommandRegistry';
import { registerAllHandlers } from './application/commands/registerAllHandlers';
import { MembershipService } from './application/MembershipService';
import type { Clock, Scheduler, SessionResolver, VideoMetadataProvider } from './application/ports';
import { PresenceService } from './application/PresenceService';
import { RequestedActions } from './application/RequestedActions';
import { RoomService } from './application/RoomService';
import { VideoResolver } from './application/VideoResolver';
import type { AppConfig } from './infrastructure/config';
import { createHttpApp } from './infrastructure/http/app';
import { createRoomsRouter } from './infrastructure/http/routes/rooms';
import { NanoIdGenerator } from './infrastructure/ids/NanoIdGenerator';
import type { Persistence } from './infrastructure/persistence';
import { RateLimiterFlexibleAdapter } from './infrastructure/ratelimit/RateLimiterFlexibleAdapter';
import { SocketBroadcaster } from './infrastructure/realtime/SocketBroadcaster';
import { SocketGateway } from './infrastructure/realtime/SocketGateway';
import { SocketPresenceProbe } from './infrastructure/realtime/SocketPresenceProbe';
import type { IoServer } from './infrastructure/realtime/types';
import { SystemClock } from './infrastructure/time/SystemClock';
import { TimerScheduler } from './infrastructure/time/TimerScheduler';
import { OEmbedMetadataProvider } from './infrastructure/video/OEmbedMetadataProvider';

export interface ComposeOptions {
  readonly config: AppConfig;
  readonly logger: PinoLogger;
  readonly sessions: SessionResolver;
  readonly persistence: Persistence;
  /** better-auth's Node handler, mounted at /api/auth (absent in socket-only tests). */
  readonly authHandler?: RequestHandler;
  /** Overrides for tests; production uses the real implementations. */
  readonly clock?: Clock;
  readonly scheduler?: Scheduler;
  readonly videoMetadata?: VideoMetadataProvider;
}

export interface ComposedApp {
  readonly httpServer: HttpServer;
  readonly io: IoServer;
  readonly rooms: RoomService;
  /** Starts background work (snapshot flushing) and listens; resolves once listening. */
  start(port: number): Promise<void>;
  /** Stops accepting work, flushes pending state and closes the servers. */
  close(): Promise<void>;
}

/**
 * Composition root (LLD SP-20, rules.md §2.7): the only place concrete classes are constructed
 * and wired. Creating the app has no side effects; `start` does.
 */
export const composeApp = (options: ComposeOptions): ComposedApp => {
  const { config, logger, sessions, persistence } = options;
  const clock = options.clock ?? new SystemClock();
  const scheduler = options.scheduler ?? new TimerScheduler(logger);
  const ids = new NanoIdGenerator();
  const limiter = new RateLimiterFlexibleAdapter();
  const videos = new VideoResolver(options.videoMetadata ?? new OEmbedMetadataProvider(logger));
  const rooms = new RoomService(persistence.rooms, clock, ids);

  const httpApp = createHttpApp({
    logger,
    clock,
    startedAt: clock.now(),
    healthChecks: persistence.healthChecks,
    webDistDir: config.webDistDir,
    production: config.nodeEnv === 'production',
    ...(options.authHandler === undefined ? {} : { authHandler: options.authHandler }),
    apiRouter: createRoomsRouter({ rooms, videos, memberships: persistence.memberships, sessions, limiter }),
  });
  const httpServer = createServer(httpApp);
  const io: IoServer = new Server(httpServer, {
    serveClient: false,
    transports: ['websocket'],
    maxHttpBufferSize: MAX_HTTP_BUFFER_BYTES,
    connectionStateRecovery: { maxDisconnectionDuration: RECOVERY_WINDOW_MS, skipMiddlewares: true },
    allowRequest: (req, callback) => {
      const { origin } = req.headers;
      callback(null, origin === undefined || origin === config.publicOrigin);
    },
  });

  const broadcaster = new SocketBroadcaster(io, clock);
  const probe = new SocketPresenceProbe(io);
  const chat = new ChatService(persistence.chat, broadcaster, ids, clock);
  const membership = new MembershipService(rooms, persistence.memberships, chat, broadcaster, probe, clock);
  const presence = new PresenceService(rooms, membership, broadcaster, probe, scheduler, logger);
  const actions = new RequestedActions(videos, ids);

  const pipeline = new CommandPipeline({ rooms, limiter, clock, logger });
  const registry = registerAllHandlers(new CommandRegistry(pipeline), {
    rooms,
    broadcaster,
    membership,
    chat,
    actions,
    ids,
    clock,
  });
  registry.assertComplete();

  new SocketGateway({ io, registry, presence, sessions, logger }).start();

  return {
    httpServer,
    io,
    rooms,
    start: (port) =>
      new Promise<void>((resolve, reject) => {
        persistence.start();
        httpServer.once('error', reject);
        httpServer.listen(port, () => {
          httpServer.off('error', reject);
          resolve();
        });
      }),
    close: async () => {
      scheduler.cancelAll();
      await io.close();
      await persistence.stop();
    },
  };
};
