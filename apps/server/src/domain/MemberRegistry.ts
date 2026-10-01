import { ROOM_CAPACITY, ROLE_RANK } from '@watchparty/shared';
import type { Role, UserId, UserRef } from '@watchparty/shared';
import { DomainError } from './DomainError';
import type { Participant } from './Participant';

export interface MemberRegistrySnapshot {
  readonly members: readonly Participant[];
  readonly bans: readonly UserId[];
  readonly roleMemory: readonly (readonly [UserId, Role])[];
}

type MemberChanges = Partial<Pick<Participant, 'name' | 'role' | 'presence' | 'awaySince'>>;

const bySuccessionOrder = (a: Participant, b: Participant): number =>
  Number(b.presence === 'online') - Number(a.presence === 'online') ||
  ROLE_RANK[b.role] - ROLE_RANK[a.role] ||
  a.joinedAt - b.joinedAt;

/** Membership, roles, presence, bans and role memory (LLD SP-4). Knows nothing about playback. */
export class MemberRegistry {
  private constructor(
    private readonly members: Map<UserId, Participant>,
    private readonly bans: Set<UserId>,
    private readonly roleMemory: Map<UserId, Role>,
  ) {}

  static empty(): MemberRegistry {
    return new MemberRegistry(new Map(), new Set(), new Map());
  }

  static fromSnapshot(s: MemberRegistrySnapshot): MemberRegistry {
    return new MemberRegistry(
      new Map(s.members.map((m) => [m.userId, { ...m }])),
      new Set(s.bans),
      new Map(s.roleMemory),
    );
  }

  toSnapshot(): MemberRegistrySnapshot {
    return {
      members: this.list(),
      bans: [...this.bans],
      roleMemory: [...this.roleMemory.entries()],
    };
  }

  get(userId: UserId): Participant | undefined {
    return this.members.get(userId);
  }

  require(userId: UserId): Participant {
    const member = this.members.get(userId);
    if (member === undefined) {
      throw new DomainError('TARGET_NOT_FOUND');
    }
    return member;
  }

  /** Members in join order; the order every list in the UI uses. */
  list(): readonly Participant[] {
    return [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  }

  host(): Participant | undefined {
    return this.list().find((m) => m.role === 'host');
  }

  isBanned(userId: UserId): boolean {
    return this.bans.has(userId);
  }

  rememberedRole(userId: UserId): Role | undefined {
    return this.roleMemory.get(userId);
  }

  admit(user: UserRef, role: Role, now: number): Participant {
    if (this.members.size >= ROOM_CAPACITY) {
      throw new DomainError('ROOM_FULL');
    }
    const member: Participant = {
      userId: user.userId,
      name: user.name,
      role,
      presence: 'online',
      awaySince: null,
      joinedAt: now,
    };
    this.members.set(member.userId, member);
    this.roleMemory.delete(member.userId);
    return member;
  }

  update(userId: UserId, changes: MemberChanges): Participant {
    const updated = { ...this.require(userId), ...changes };
    this.members.set(userId, updated);
    return updated;
  }

  /** Removes a member and remembers a non-default role so a returning user gets it back. */
  release(userId: UserId): Participant {
    const member = this.require(userId);
    this.members.delete(userId);
    if (member.role !== 'participant') {
      this.roleMemory.set(userId, member.role);
    }
    return member;
  }

  ban(userId: UserId): void {
    this.bans.add(userId);
    this.roleMemory.delete(userId);
  }

  /** Next host: online before away, then highest rank, then longest-present (LLD SP-4). */
  pickSuccessor(): Participant | undefined {
    return this.list()
      .filter((m) => m.role !== 'host')
      .sort(bySuccessionOrder)[0];
  }

  awayLongerThan(graceMs: number, now: number): readonly Participant[] {
    return this.list().filter(
      (m) => m.presence === 'away' && m.awaySince !== null && now - m.awaySince >= graceMs,
    );
  }
}
