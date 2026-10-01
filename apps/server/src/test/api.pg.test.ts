import { getAuthTables } from 'better-auth/db';
import { toNodeHandler } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreateRoomResponse, RoomPreview, RoomSummary } from '@watchparty/shared';
import { RATE_LIMITS } from '@watchparty/shared';
import { RecordingLogger } from '../application/test/fakes';
import { createAuth } from '../infrastructure/auth/auth';
import type { Auth } from '../infrastructure/auth/auth';
import { BetterAuthSessionResolver } from '../infrastructure/auth/BetterAuthSessionResolver';
import { authSchema, user } from '../infrastructure/db/schema';
import { createPostgresPersistence } from '../infrastructure/persistence';
import { CookieJar } from './cookies';
import { testDatabase } from './db/testDatabase';
import { call, ORIGIN, startServer } from './server';
import type { TestServer } from './server';

const database = testDatabase();
const logger = new RecordingLogger();
let server: TestServer;
let auth: Auth;

const boot = async (): Promise<TestServer> => {
  const persistence = createPostgresPersistence(database, logger);
  auth = createAuth({
    db: database.db,
    secret: 'test-secret-test-secret-test-secret!',
    baseUrl: ORIGIN,
    trustedOrigins: [ORIGIN],
    secureCookies: false,
    memberships: persistence.memberships,
    logger,
  });
  return startServer({
    persistence,
    auth: { sessions: new BetterAuthSessionResolver(auth), handler: toNodeHandler(auth) },
  });
};

beforeEach(async () => {
  await database.reset();
  server = await boot();
});

afterEach(async () => {
  await server.close();
});

afterAll(async () => {
  await database.close();
});

/** A browser-like client: cookie jar + same-origin header. */
const browser = () => {
  const jar = new CookieJar();
  const request = async (method: string, path: string, body?: unknown): Promise<Response> => {
    const headers: Record<string, string> = { origin: ORIGIN, cookie: jar.header() };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(`${server.url}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    jar.store(response);
    return response;
  };
  return {
    jar,
    request,
    guest: async (name: string) => {
      expect((await request('POST', '/api/auth/sign-in/anonymous', {})).status).toBe(200);
      expect((await request('POST', '/api/auth/update-user', { name })).status).toBe(200);
    },
    createRoom: async (body: unknown = {}) => {
      const response = await request('POST', '/api/rooms', body);
      return { status: response.status, body: (await response.json()) as CreateRoomResponse };
    },
  };
};

describe('better-auth schema', () => {
  it('has a Drizzle column for every field better-auth expects', () => {
    for (const table of Object.values(getAuthTables(auth.options))) {
      const columns = authSchema[table.modelName as keyof typeof authSchema] as unknown as Record<
        string,
        unknown
      >;
      expect(columns, table.modelName).toBeDefined();
      for (const field of Object.keys(table.fields)) {
        expect(columns[field], `${table.modelName}.${field}`).toBeDefined();
      }
    }
  });
});

describe('REST + auth', () => {
  it('reports database health', async () => {
    expect(await (await fetch(`${server.url}/api/health`)).json()).toMatchObject({
      status: 'ok',
      checks: { db: true },
    });
  });

  it('requires a session to create rooms or list recent rooms', async () => {
    const anonymous = browser();
    expect((await anonymous.createRoom()).status).toBe(401);
    expect((await anonymous.request('GET', '/api/me/rooms')).status).toBe(401);
  });

  it('lets a guest create a room named after them, with an initial video cued', async () => {
    const hana = browser();
    await hana.guest('Hana');
    const created = await hana.createRoom({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ?t=42' });
    expect(created.status).toBe(201);
    expect((await (await hana.request('GET', '/api/me/rooms')).json()) as RoomSummary[]).toMatchObject([
      { roomId: created.body.roomId, lastRole: 'host' },
    ]);

    const preview = (await (
      await fetch(`${server.url}/api/rooms/${created.body.roomId.toLowerCase()}`)
    ).json()) as RoomPreview;
    expect(preview).toEqual({
      roomId: created.body.roomId,
      name: "Hana's room",
      hostName: 'Hana',
      participantCount: 0,
      video: { id: 'dQw4w9WgXcQ', title: 'Video dQw4w9WgXcQ', thumbnailUrl: expect.any(String) as string },
    });
    const room = await server.app.rooms.read(created.body.roomId);
    expect(room.playback).toMatchObject({ isPlaying: false, anchorPosition: 42 });
  });

  it('validates input and maps domain errors to HTTP statuses', async () => {
    const hana = browser();
    await hana.guest('Hana');
    expect((await hana.createRoom({ name: '' })).status).toBe(400);
    expect((await hana.createRoom({ videoUrl: 'not a video' })).status).toBe(422);
    expect((await hana.request('POST', '/api/rooms', '{"broken json')).status).toBe(400);
    expect((await fetch(`${server.url}/api/rooms/ZZZZZZ`)).status).toBe(404);
    expect(await (await fetch(`${server.url}/api/rooms/not-a-code`)).json()).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'That request was malformed.' },
    });
  });

  it('rate limits room creation per user', async () => {
    const hana = browser();
    await hana.guest('Hana');
    for (let i = 0; i < RATE_LIMITS.createRoom.points; i += 1) {
      expect((await hana.createRoom()).status).toBe(201);
    }
    expect((await hana.createRoom()).status).toBe(429);
  });

  it('authenticates sockets with the session cookie and uses the session name', async () => {
    const hana = browser();
    await hana.guest('Hana');
    const { roomId } = (await hana.createRoom()).body;
    await expect(server.connect(null)).rejects.toThrow('UNAUTHENTICATED');
    const socket = await server.connect({ cookie: hana.jar.header() });
    const ack = await call(socket, 'join_room', { roomId });
    expect(ack).toMatchObject({ ok: true, data: { room: { self: { name: 'Hana', role: 'host' } } } });
  });

  it('lists recent rooms and keeps them when a guest signs up', async () => {
    const hana = browser();
    await hana.guest('Hana');
    const { roomId } = (await hana.createRoom()).body;
    const socket = await server.connect({ cookie: hana.jar.header() });
    await call(socket, 'join_room', { roomId });
    expect((await (await hana.request('GET', '/api/me/rooms')).json()) as RoomSummary[]).toMatchObject([
      { roomId, name: "Hana's room", lastRole: 'host' },
    ]);
    const [guestRow] = await database.db.select({ id: user.id }).from(user).where(eq(user.isAnonymous, true));

    const signUp = await hana.request('POST', '/api/auth/sign-up/email', {
      email: 'hana@example.test',
      password: 'correct horse battery',
      name: 'Hana',
    });
    expect(signUp.status).toBe(200);
    expect((await (await hana.request('GET', '/api/me/rooms')).json()) as RoomSummary[]).toMatchObject([
      { roomId, lastRole: 'host' },
    ]);
    expect(await database.db.select().from(user).where(eq(user.id, guestRow!.id))).toEqual([]);
  });
});

describe('durability', () => {
  it('rooms survive a server restart', async () => {
    const hana = browser();
    await hana.guest('Hana');
    const { roomId } = (await hana.createRoom()).body;
    const socket = await server.connect({ cookie: hana.jar.header() });
    await call(socket, 'join_room', { roomId });
    await call(socket, 'change_video', { url: 'https://youtu.be/dQw4w9WgXcQ' });
    await call(socket, 'chat_message', { text: 'see you after the restart' });
    await server.close();

    server = await boot();
    const room = await server.app.rooms.read(roomId);
    expect(room.playback.video?.id).toBe('dQw4w9WgXcQ');
    expect(room.participant(room.hostId)?.name).toBe('Hana');
    const again = await server.connect({ cookie: hana.jar.header() });
    expect(await call(again, 'join_room', { roomId })).toMatchObject({
      ok: true,
      data: { room: { self: { role: 'host' } }, chatHistory: [{ text: 'see you after the restart' }] },
    });
  });
});
