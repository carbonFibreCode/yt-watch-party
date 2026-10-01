import type { AuthUser, RequestHeaders, SessionResolver } from '../../application/ports';

export const TEST_USER_HEADER = 'x-test-user';

/**
 * Development/test identity from a `x-test-user: <userId>:<name>` header (LLD SP-2). Never wired
 * in production: the composition root only selects it outside NODE_ENV=production.
 */
export class StaticSessionResolver implements SessionResolver {
  resolve(headers: RequestHeaders): Promise<AuthUser | null> {
    const raw = headers[TEST_USER_HEADER];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const separator = value?.indexOf(':') ?? -1;
    if (value === undefined || separator <= 0 || separator === value.length - 1) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      userId: value.slice(0, separator),
      name: value.slice(separator + 1),
      isAnonymous: true,
    });
  }
}
