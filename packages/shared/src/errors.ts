/** Error codes and user-facing messages (LLD §Error Catalogue). The only source for both. */
export const ErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  FORBIDDEN: 'FORBIDDEN',
  BANNED: 'BANNED',
  ROOM_FULL: 'ROOM_FULL',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  TARGET_OFFLINE: 'TARGET_OFFLINE',
  INVALID_VIDEO: 'INVALID_VIDEO',
  EMBED_DISABLED: 'EMBED_DISABLED',
  QUEUE_FULL: 'QUEUE_FULL',
  REQUEST_EXPIRED: 'REQUEST_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',
  TIMEOUT: 'TIMEOUT',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: 'Please enter a name to continue.',
  VALIDATION_FAILED: 'That request was malformed.',
  ROOM_NOT_FOUND: "This room doesn't exist.",
  NOT_IN_ROOM: 'Join the room first.',
  FORBIDDEN: "You don't have permission to do that.",
  BANNED: 'You were removed from this room.',
  ROOM_FULL: 'This room is full.',
  TARGET_NOT_FOUND: 'That user or item is no longer here.',
  TARGET_OFFLINE: "They're not online right now.",
  INVALID_VIDEO: "That doesn't look like a valid YouTube video.",
  EMBED_DISABLED: 'The owner disabled embedding for this video.',
  QUEUE_FULL: 'The queue is full.',
  REQUEST_EXPIRED: 'That request has expired.',
  RATE_LIMITED: 'Slow down a little.',
  CONFLICT: 'Too many changes at once, try again.',
  TIMEOUT: 'Connection is slow, try again.',
  INTERNAL: 'Something went wrong.',
};

export interface AckError {
  readonly code: ErrorCode;
  readonly message: string;
}

/** The one envelope every socket command acknowledges with (rules.md §7.3). */
export type AckResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: AckError };

export const ackOk = <T>(data: T): AckResult<T> => ({ ok: true, data });

export const ackError = <T = never>(code: ErrorCode): AckResult<T> => ({
  ok: false,
  error: { code, message: ERROR_MESSAGES[code] },
});

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && Object.hasOwn(ErrorCode, value);
