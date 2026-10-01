import { describe, expect, it } from 'vitest';
import type { Role } from './contract/primitives';
import { CAPABILITIES, PermissionPolicy } from './permissions';
import type { Capability } from './permissions';

/**
 * Expected matrix written out independently of ROLE_CAPABILITIES (LLD SP-3 table),
 * so a wrong edit to the source table fails here instead of being mirrored.
 */
const EXPECTED: Record<Role, Record<Capability, boolean>> = {
  host: {
    'playback.control': true,
    'request.create': false,
    'request.resolve': true,
    'member.assignRole': true,
    'member.remove': true,
    'host.transfer': true,
    'chat.send': true,
    'reaction.send': true,
  },
  moderator: {
    'playback.control': true,
    'request.create': false,
    'request.resolve': true,
    'member.assignRole': false,
    'member.remove': true,
    'host.transfer': false,
    'chat.send': true,
    'reaction.send': true,
  },
  participant: {
    'playback.control': false,
    'request.create': true,
    'request.resolve': false,
    'member.assignRole': false,
    'member.remove': false,
    'host.transfer': false,
    'chat.send': true,
    'reaction.send': true,
  },
  viewer: {
    'playback.control': false,
    'request.create': false,
    'request.resolve': false,
    'member.assignRole': false,
    'member.remove': false,
    'host.transfer': false,
    'chat.send': true,
    'reaction.send': true,
  },
};

const ROLES = Object.keys(EXPECTED) as Role[];

describe('PermissionPolicy.can', () => {
  const cases = ROLES.flatMap((role) =>
    CAPABILITIES.map((capability) => ({ role, capability, allowed: EXPECTED[role][capability] })),
  );

  it.each(cases)('$role → $capability = $allowed', ({ role, capability, allowed }) => {
    expect(PermissionPolicy.can(role, capability)).toBe(allowed);
  });

  it('covers every capability for every role', () => {
    expect(cases).toHaveLength(ROLES.length * CAPABILITIES.length);
  });
});

describe('PermissionPolicy.canActOn', () => {
  it.each([
    { actor: 'host', target: 'moderator', allowed: true },
    { actor: 'host', target: 'participant', allowed: true },
    { actor: 'host', target: 'viewer', allowed: true },
    { actor: 'moderator', target: 'participant', allowed: true },
    { actor: 'moderator', target: 'viewer', allowed: true },
    { actor: 'moderator', target: 'moderator', allowed: false },
    { actor: 'moderator', target: 'host', allowed: false },
    { actor: 'participant', target: 'viewer', allowed: true },
    { actor: 'participant', target: 'participant', allowed: false },
    { actor: 'viewer', target: 'participant', allowed: false },
  ] satisfies { actor: Role; target: Role; allowed: boolean }[])(
    '$actor acting on $target = $allowed',
    ({ actor, target, allowed }) => {
      expect(PermissionPolicy.canActOn(actor, target, false)).toBe(allowed);
    },
  );

  it.each(ROLES)('never lets a %s act on themselves', (role) => {
    expect(PermissionPolicy.canActOn(role, 'viewer', true)).toBe(false);
  });
});

describe('PermissionPolicy.isStaff', () => {
  it.each([
    ['host', true],
    ['moderator', true],
    ['participant', false],
    ['viewer', false],
  ] satisfies [Role, boolean][])('%s → %s', (role, staff) => {
    expect(PermissionPolicy.isStaff(role)).toBe(staff);
  });
});
