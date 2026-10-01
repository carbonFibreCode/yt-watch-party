import type { Presence, Role, UserId } from '@watchparty/shared';

/**
 * A room member. Immutable: MemberRegistry replaces the record on every change, so nothing
 * outside the registry can mutate membership state through an alias (LLD SP-4).
 */
export interface Participant {
  readonly userId: UserId;
  readonly name: string;
  readonly role: Role;
  readonly presence: Presence;
  /** Server epoch ms when the user's last socket closed; null while online. */
  readonly awaySince: number | null;
  /** Used for host succession order. */
  readonly joinedAt: number;
}
