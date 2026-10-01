import type { AddressInfo } from 'node:net';
import { pino } from 'pino';
import { io as connectClient } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import type {
  AckData,
  AckResult,
  ClientEventName,
  ClientToServerEvents,
  ServerEventName,
  ServerToClientEvents,
} from '@watchparty/shared';
import { ACK_TIMEOUT_MS } from '@watchparty/shared';
import { FakeClock, ManualScheduler, StubVideoMetadataProvider } from '../application/test/fakes';
import { composeApp } from '../compose';
import { StaticSessionResolver, TEST_USER_HEADER } from '../infrastructure/auth/StaticSessionResolver';

export type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

export const ORIGIN = 'http://localhost:5173';
const EVENT_TIMEOUT_MS = 2_000;

/** The real composed server on an ephemeral port, with deterministic time and timers. */
export const startServer = async (webDistDir?: string) => {
  const clock = new FakeClock();
  const scheduler = new ManualScheduler();
  const metadata = new StubVideoMetadataProvider();
  const app = composeApp({
    config: { nodeEnv: 'test', port: 0, logLevel: 'silent', publicOrigin: ORIGIN, webDistDir },
    logger: pino({ level: 'silent' }),
    sessions: new StaticSessionResolver(),
    clock,
    scheduler,
    videoMetadata: metadata,
  });
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  const url = `http://localhost:${String((app.httpServer.address() as AddressInfo).port)}`;
  const clients: Client[] = [];

  const connect = (
    user: string | null,
    options: { origin?: string; reconnection?: boolean } = {},
  ): Promise<Client> => {
    const headers: Record<string, string> = { origin: options.origin ?? ORIGIN };
    if (user !== null) {
      headers[TEST_USER_HEADER] = user;
    }
    const socket: Client = connectClient(url, {
      transports: ['websocket'],
      extraHeaders: headers,
      forceNew: true,
      reconnection: options.reconnection ?? false,
      reconnectionDelay: 10,
    });
    clients.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => {
        resolve(socket);
      });
      socket.once('connect_error', reject);
    });
  };

  return {
    url,
    app,
    clock,
    scheduler,
    metadata,
    connect,
    close: async () => {
      for (const client of clients) {
        client.disconnect();
      }
      await app.close();
    },
  };
};

export type TestServer = Awaited<ReturnType<typeof startServer>>;

export const call = <E extends ClientEventName>(
  socket: Client,
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<AckResult<AckData[E]>> =>
  // The client typings cannot express "payload then ack" generically for a union of events.
  (
    socket.timeout(ACK_TIMEOUT_MS) as unknown as {
      emitWithAck: (e: string, p: unknown) => Promise<AckResult<AckData[E]>>;
    }
  ).emitWithAck(event, payload);

/** Resolves with the next payload of `event` (rejects after a timeout). */
export const next = <E extends ServerEventName>(
  socket: Client,
  event: E,
): Promise<Parameters<ServerToClientEvents[E]>[0]> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for ${event}`));
    }, EVENT_TIMEOUT_MS);
    (socket as unknown as { once: (e: string, cb: (p: unknown) => void) => void }).once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload as Parameters<ServerToClientEvents[E]>[0]);
    });
  });

/** Collects every payload of `event` from now on. */
export const record = (socket: Client, event: ServerEventName): unknown[] => {
  const received: unknown[] = [];
  (socket as unknown as { on: (e: string, cb: (p: unknown) => void) => void }).on(event, (payload) => {
    received.push(payload);
  });
  return received;
};

/** Lets in-flight socket traffic settle (a round trip through the server). */
export const settle = async (socket: Client): Promise<void> => {
  await call(socket, 'timesync', { jsonrpc: '2.0', id: 0, method: 'timesync' });
};
