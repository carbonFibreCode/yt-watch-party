import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

const respond = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts JSON with credentials and validates the response', async () => {
    const fetchSpy = respond(201, { roomId: 'K7M2QX' });
    expect(await api.createRoom({ name: 'Movie night' })).toEqual({ roomId: 'K7M2QX' });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/rooms');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      body: '{"name":"Movie night"}',
    });
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });

  it('surfaces the server error code', async () => {
    respond(404, { error: { code: 'ROOM_NOT_FOUND', message: "This room doesn't exist." } });
    await expect(api.roomPreview('ZZZZZZ')).rejects.toEqual(new ApiError('ROOM_NOT_FOUND', 404));
  });

  it('treats unexpected bodies as internal errors', async () => {
    respond(200, { surprise: true });
    await expect(api.myRooms()).rejects.toMatchObject({ code: 'INTERNAL', status: 200 });
    respond(502, '<html>bad gateway</html>');
    await expect(api.myRooms()).rejects.toMatchObject({ code: 'INTERNAL', status: 502 });
  });
});
