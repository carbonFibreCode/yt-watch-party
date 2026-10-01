import type { z } from 'zod';
import { CreateRoomResponse, HttpErrorResponse, RoomPreview, RoomSummaryList } from '@watchparty/shared';
import type { CreateRoomBody, ErrorCode, RoomCode, RoomSummary } from '@watchparty/shared';

/** A failed REST call, carrying the server's error code (LLD SP-18). */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

const request = async <T>(schema: z.ZodType<T>, path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = HttpErrorResponse.safeParse(body);
    throw new ApiError(parsed.success ? parsed.data.error.code : 'INTERNAL', response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('INTERNAL', response.status);
  }
  return parsed.data;
};

/** Typed REST client; every response is validated against the shared contract. */
export const api = {
  createRoom: (body: CreateRoomBody): Promise<CreateRoomResponse> =>
    request(CreateRoomResponse, '/rooms', { method: 'POST', body: JSON.stringify(body) }),
  roomPreview: (roomId: RoomCode): Promise<RoomPreview> => request(RoomPreview, `/rooms/${roomId}`),
  myRooms: (): Promise<RoomSummary[]> => request(RoomSummaryList, '/me/rooms'),
} as const;
