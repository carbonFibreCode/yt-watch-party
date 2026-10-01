import { anonymousClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/** better-auth client (LLD SP-2). Same origin, so it talks to /api/auth with the session cookie. */
export const authClient = createAuthClient({ plugins: [anonymousClient()] });

export type AuthSession = NonNullable<ReturnType<typeof authClient.useSession>['data']>;
