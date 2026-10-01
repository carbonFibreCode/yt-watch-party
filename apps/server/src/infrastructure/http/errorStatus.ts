import type { ErrorCode } from '@watchparty/shared';

/** DomainError code → HTTP status for REST responses (LLD SP-18). */
export const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  VALIDATION_FAILED: 400,
  ROOM_NOT_FOUND: 404,
  NOT_FOUND: 404,
  NOT_IN_ROOM: 403,
  FORBIDDEN: 403,
  BANNED: 403,
  ROOM_FULL: 409,
  TARGET_NOT_FOUND: 404,
  TARGET_OFFLINE: 409,
  INVALID_VIDEO: 422,
  EMBED_DISABLED: 422,
  QUEUE_FULL: 409,
  REQUEST_EXPIRED: 410,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  TIMEOUT: 504,
  INTERNAL: 500,
};
