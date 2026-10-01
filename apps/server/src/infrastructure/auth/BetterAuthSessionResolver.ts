import { fromNodeHeaders } from 'better-auth/node';
import type { AuthUser, RequestHeaders, SessionResolver } from '../../application/ports';
import type { Auth } from './auth';

/** Session cookie → AuthUser, for both the socket handshake and REST (LLD SP-2). */
export class BetterAuthSessionResolver implements SessionResolver {
  constructor(private readonly auth: Auth) {}

  async resolve(headers: RequestHeaders): Promise<AuthUser | null> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (session === null) {
      return null;
    }
    const { id, name, isAnonymous } = session.user;
    return { userId: id, name, isAnonymous: isAnonymous === true };
  }
}
