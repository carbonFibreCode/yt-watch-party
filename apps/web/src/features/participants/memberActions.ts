import { PermissionPolicy } from '@watchparty/shared';
import type { AssignableRole, ParticipantView } from '@watchparty/shared';

export type MemberAction =
  | { readonly kind: 'assign'; readonly role: AssignableRole }
  | { readonly kind: 'transfer' }
  | { readonly kind: 'remove' };

const ASSIGNABLE: readonly AssignableRole[] = ['moderator', 'participant', 'viewer'];

/**
 * What `self` may do to `target`, derived from the same PermissionPolicy the server enforces
 * (LLD SP-3), so the menu never offers an action the server would refuse.
 */
export const memberActions = (self: ParticipantView, target: ParticipantView): MemberAction[] => {
  if (self.userId === target.userId) {
    return [];
  }
  const outranks = PermissionPolicy.canActOn(self.role, target.role, false);
  const actions: MemberAction[] = [];
  if (outranks && PermissionPolicy.can(self.role, 'member.assignRole')) {
    for (const role of ASSIGNABLE) {
      if (role !== target.role) {
        actions.push({ kind: 'assign', role });
      }
    }
  }
  if (PermissionPolicy.can(self.role, 'host.transfer') && target.presence === 'online') {
    actions.push({ kind: 'transfer' });
  }
  if (outranks && PermissionPolicy.can(self.role, 'member.remove')) {
    actions.push({ kind: 'remove' });
  }
  return actions;
};
