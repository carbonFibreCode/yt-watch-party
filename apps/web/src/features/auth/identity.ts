import { authClient } from '@/lib/authClient';
import type { AuthSession } from '@/lib/authClient';
import { DisplayName } from '@watchparty/shared';

/** better-auth's name for a fresh anonymous user; treated as "no name chosen yet". */
export const DEFAULT_GUEST_NAME = 'Anonymous';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

const FALLBACK_MESSAGE = 'Could not sign you in. Please try again.';

const check = (result: { error: { message?: string | undefined } | null }): void => {
  if (result.error !== null) {
    throw new AuthError(result.error.message ?? FALLBACK_MESSAGE);
  }
};

export const hasChosenName = (session: AuthSession | null | undefined): session is AuthSession =>
  session !== null && session !== undefined && session.user.name !== DEFAULT_GUEST_NAME;

export const validateName = (name: string): string | null =>
  DisplayName.safeParse(name).success ? null : 'Enter a name between 1 and 32 characters.';

/**
 * Makes sure the browser has a session with the given display name (LLD SP-2): signs in as a
 * guest when needed, then renames. The server always reads the name from this session.
 */
export const ensureIdentity = async (name: string): Promise<void> => {
  const trimmed = name.trim();
  const current = await authClient.getSession();
  if (current.data === null) {
    check(await authClient.signIn.anonymous());
  }
  if (current.data?.user.name !== trimmed) {
    check(await authClient.updateUser({ name: trimmed }));
  }
};
