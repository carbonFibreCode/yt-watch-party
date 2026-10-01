import type { ErrorCode } from '@watchparty/shared';

/** The only error type thrown on purpose (rules.md §7.1). The pipeline maps `code` to an ack error. */
export class DomainError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'DomainError';
  }
}

/** Thrown when the aggregate detects a broken invariant. Always a bug, never user-caused. */
export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantViolation';
  }
}
