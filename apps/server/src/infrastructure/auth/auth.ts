import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins';
import { AUTH_COOKIE_CACHE_S, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@watchparty/shared';
import type { Logger, MembershipRepository } from '../../application/ports';
import type { Db } from '../db/client';
import { authSchema } from '../db/schema';

export interface AuthOptions {
  readonly db: Db;
  readonly secret: string;
  readonly baseUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly secureCookies: boolean;
  readonly memberships: MembershipRepository;
  readonly logger: Logger;
}

/**
 * better-auth (LLD SP-2): guest sessions via the anonymous plugin plus email/password, stored in
 * Postgres through the Drizzle adapter. Linking a guest to a real account carries over their
 * "recent rooms"; live room identity is per account (signing in = switching accounts).
 */
// better-auth infers its instance type from the options; restating it by hand would duplicate this config.
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const createAuth = (options: AuthOptions) =>
  betterAuth({
    appName: 'Watch Party',
    baseURL: options.baseUrl,
    basePath: '/api/auth',
    secret: options.secret,
    trustedOrigins: [...options.trustedOrigins],
    database: drizzleAdapter(options.db, { provider: 'pg', schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
    },
    session: { cookieCache: { enabled: true, maxAge: AUTH_COOKIE_CACHE_S } },
    advanced: { useSecureCookies: options.secureCookies },
    telemetry: { enabled: false },
    plugins: [
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await options.memberships.reassign(anonymousUser.user.id, newUser.user.id);
          options.logger.info({ from: anonymousUser.user.id, to: newUser.user.id }, 'guest account linked');
        },
      }),
    ],
  });

export type Auth = ReturnType<typeof createAuth>;
