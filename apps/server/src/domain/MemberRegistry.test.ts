import { describe, expect, it } from 'vitest';
import { ROOM_CAPACITY } from '@watchparty/shared';
import { DomainError } from './DomainError';
import { MemberRegistry } from './MemberRegistry';
import { HOST, MOD, PART, T0, user, VIEWER } from './test/builders';

const registryWith = (): MemberRegistry => {
  const registry = MemberRegistry.empty();
  registry.admit(HOST, 'host', T0);
  registry.admit(MOD, 'moderator', T0 + 1);
  registry.admit(PART, 'participant', T0 + 2);
  registry.admit(VIEWER, 'viewer', T0 + 3);
  return registry;
};

describe('MemberRegistry', () => {
  it('admits members online, in join order', () => {
    const registry = registryWith();
    expect(registry.list().map((m) => m.userId)).toEqual([HOST, MOD, PART, VIEWER].map((u) => u.userId));
    expect(registry.get(PART.userId)?.presence).toBe('online');
  });

  it('finds the host', () => {
    expect(registryWith().host()?.userId).toBe(HOST.userId);
  });

  it('throws TARGET_NOT_FOUND for unknown members', () => {
    expect(() => MemberRegistry.empty().require('ghost')).toThrow(new DomainError('TARGET_NOT_FOUND'));
  });

  it(`rejects admission beyond ${String(ROOM_CAPACITY)} members`, () => {
    const registry = MemberRegistry.empty();
    for (let i = 0; i < ROOM_CAPACITY; i += 1) {
      registry.admit(user(`u${String(i)}`), 'participant', T0 + i);
    }
    expect(() => registry.admit(user('late'), 'participant', T0)).toThrow(new DomainError('ROOM_FULL'));
  });

  it('remembers non-default roles on release and forgets them on readmission', () => {
    const registry = registryWith();
    registry.release(MOD.userId);
    registry.release(PART.userId);
    expect(registry.rememberedRole(MOD.userId)).toBe('moderator');
    expect(registry.rememberedRole(PART.userId)).toBeUndefined();
    registry.admit(MOD, 'participant', T0 + 10);
    expect(registry.rememberedRole(MOD.userId)).toBeUndefined();
  });

  it('banning forgets the remembered role', () => {
    const registry = registryWith();
    registry.release(MOD.userId);
    registry.ban(MOD.userId);
    expect(registry.isBanned(MOD.userId)).toBe(true);
    expect(registry.rememberedRole(MOD.userId)).toBeUndefined();
  });

  describe('pickSuccessor', () => {
    it('prefers the highest rank', () => {
      expect(registryWith().pickSuccessor()?.userId).toBe(MOD.userId);
    });

    it('breaks rank ties by earliest join', () => {
      const registry = MemberRegistry.empty();
      registry.admit(HOST, 'host', T0);
      registry.admit(VIEWER, 'participant', T0 + 5);
      registry.admit(PART, 'participant', T0 + 2);
      expect(registry.pickSuccessor()?.userId).toBe(PART.userId);
    });

    it('prefers an online member over a higher-ranked away member', () => {
      const registry = registryWith();
      registry.update(MOD.userId, { presence: 'away', awaySince: T0 });
      expect(registry.pickSuccessor()?.userId).toBe(PART.userId);
    });

    it('falls back to an away member when nobody is online', () => {
      const registry = MemberRegistry.empty();
      registry.admit(HOST, 'host', T0);
      registry.admit(MOD, 'moderator', T0 + 1);
      registry.update(MOD.userId, { presence: 'away', awaySince: T0 });
      expect(registry.pickSuccessor()?.userId).toBe(MOD.userId);
    });

    it('returns undefined when only the host remains', () => {
      const registry = MemberRegistry.empty();
      registry.admit(HOST, 'host', T0);
      expect(registry.pickSuccessor()).toBeUndefined();
    });
  });

  it('lists members away for at least the grace period', () => {
    const registry = registryWith();
    registry.update(MOD.userId, { presence: 'away', awaySince: T0 });
    registry.update(PART.userId, { presence: 'away', awaySince: T0 + 5_000 });
    expect(registry.awayLongerThan(10_000, T0 + 10_000).map((m) => m.userId)).toEqual([MOD.userId]);
  });

  it('round-trips through a snapshot without aliasing', () => {
    const registry = registryWith();
    registry.release(MOD.userId);
    registry.ban('u-banned');
    const snapshot = registry.toSnapshot();
    const restored = MemberRegistry.fromSnapshot(snapshot);
    restored.update(PART.userId, { role: 'viewer' });
    expect(snapshot.members.find((m) => m.userId === PART.userId)?.role).toBe('participant');
    expect(restored.toSnapshot().bans).toEqual(['u-banned']);
    expect(restored.rememberedRole(MOD.userId)).toBe('moderator');
  });
});
