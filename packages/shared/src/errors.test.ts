import { describe, expect, it } from 'vitest';
import { ackError, ackOk, ERROR_MESSAGES, ErrorCode, isErrorCode } from './errors';

describe('errors', () => {
  it('has a non-empty message for every code', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });

  it('wraps successful data', () => {
    expect(ackOk({ requestId: 'r1' })).toEqual({ ok: true, data: { requestId: 'r1' } });
  });

  it('builds an error ack with the catalogue message', () => {
    expect(ackError('FORBIDDEN')).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: ERROR_MESSAGES.FORBIDDEN },
    });
  });

  it.each([
    ['FORBIDDEN', true],
    ['NOPE', false],
    ['toString', false],
    [42, false],
  ])('isErrorCode(%s) = %s', (value, expected) => {
    expect(isErrorCode(value)).toBe(expected);
  });
});
