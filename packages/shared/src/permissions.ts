import type { Role } from './contract/primitives';

/**
 * Role-based access control (LLD SP-3). Shared by the server's `authorize` middleware and the
 * client's `useCan()` so the UI disables exactly what the server would reject (rules.md §4.1).
 */

export const CAPABILITIES = [
  'playback.control',
  'request.create',
  'request.resolve',
  'member.assignRole',
  'member.remove',
  'host.transfer',
  'chat.send',
  'reaction.send',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const ROLE_RANK = {
  viewer: 0,
  participant: 1,
  moderator: 2,
  host: 3,
} as const satisfies Record<Role, number>;

/** The permission matrix as data: extend by editing this table, never by adding branches. */
export const ROLE_CAPABILITIES: Readonly<Record<Role, ReadonlySet<Capability>>> = {
  host: new Set<Capability>([
    'playback.control',
    'request.resolve',
    'member.assignRole',
    'member.remove',
    'host.transfer',
    'chat.send',
    'reaction.send',
  ]),
  moderator: new Set<Capability>([
    'playback.control',
    'request.resolve',
    'member.remove',
    'chat.send',
    'reaction.send',
  ]),
  participant: new Set<Capability>(['request.create', 'chat.send', 'reaction.send']),
  viewer: new Set<Capability>(['chat.send', 'reaction.send']),
};

export const PermissionPolicy = {
  /** Capability check: may this role perform the action at all? */
  can: (role: Role, capability: Capability): boolean => ROLE_CAPABILITIES[role].has(capability),

  /** Relational check: an actor may only act on strictly lower ranks, and never on themselves. */
  canActOn: (actor: Role, target: Role, isSameUser: boolean): boolean =>
    !isSameUser && ROLE_RANK[actor] > ROLE_RANK[target],

  isStaff: (role: Role): boolean => ROLE_CAPABILITIES[role].has('request.resolve'),
} as const;
