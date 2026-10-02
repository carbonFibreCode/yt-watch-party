import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type {
  AckData,
  AckResult,
  ClientEventName,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@watchparty/shared';

export type WatchSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const ACK_TIMEOUT_MS = 10_000;

/** Cookie header value from a response's Set-Cookie lines (name=value pairs only). */
const cookiesOf = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');

const post = async (url: string, path: string, body: unknown, cookie?: string): Promise<Response> => {
  const response = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: url, ...(cookie === undefined ? {} : { cookie }) },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} → ${String(response.status)} ${await response.text()}`);
  }
  return response;
};

/** The same guest flow as the web app: anonymous sign-in, then set the display name. */
export const signInGuest = async (url: string, name: string): Promise<string> => {
  const cookie = cookiesOf(await post(url, '/api/auth/sign-in/anonymous', {}));
  await post(url, '/api/auth/update-user', { name }, cookie);
  return cookie;
};

export const createRoom = async (
  url: string,
  cookie: string,
  name: string,
  videoUrl: string,
): Promise<string> => {
  const response = await post(url, '/api/rooms', { name, videoUrl }, cookie);
  return ((await response.json()) as { roomId: string }).roomId;
};

export const connect = (url: string, cookie: string): Promise<WatchSocket> => {
  const socket: WatchSocket = io(url, {
    transports: ['websocket'],
    extraHeaders: { cookie, origin: url },
    reconnection: false,
    forceNew: true,
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => {
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      socket.disconnect();
      reject(error);
    });
  });
};

/** emitWithAck for one event; the client typings cannot express "payload then ack" generically. */
export const call = <E extends ClientEventName>(
  socket: WatchSocket,
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<AckResult<AckData[E]>> =>
  (
    socket.timeout(ACK_TIMEOUT_MS) as unknown as {
      emitWithAck: (e: string, p: unknown) => Promise<AckResult<AckData[E]>>;
    }
  ).emitWithAck(event, payload);
