import { describe, expect, it } from 'vitest';
import { InMemoryMembershipRepository } from './InMemoryMembershipRepository';

describe('InMemoryMembershipRepository', () => {
  it('lists recent rooms newest first, updating on rejoin', async () => {
    const repo = new InMemoryMembershipRepository();
    await repo.touch({ roomId: 'AAAAAA', userId: 'u1', roomName: 'A', role: 'host', at: 1 });
    await repo.touch({ roomId: 'BBBBBB', userId: 'u1', roomName: 'B', role: 'participant', at: 2 });
    await repo.touch({ roomId: 'AAAAAA', userId: 'u1', roomName: 'A', role: 'moderator', at: 3 });
    expect(await repo.recentForUser('u1', 10)).toEqual([
      { roomId: 'AAAAAA', name: 'A', lastRole: 'moderator', lastJoinedAt: 3 },
      { roomId: 'BBBBBB', name: 'B', lastRole: 'participant', lastJoinedAt: 2 },
    ]);
    expect(await repo.recentForUser('u1', 1)).toHaveLength(1);
    expect(await repo.recentForUser('nobody', 10)).toEqual([]);
  });

  it('moves memberships to a linked account, keeping the newest entry per room', async () => {
    const repo = new InMemoryMembershipRepository();
    await repo.touch({ roomId: 'AAAAAA', userId: 'anon', roomName: 'A', role: 'host', at: 5 });
    await repo.touch({ roomId: 'BBBBBB', userId: 'anon', roomName: 'B', role: 'viewer', at: 1 });
    await repo.touch({ roomId: 'BBBBBB', userId: 'real', roomName: 'B', role: 'moderator', at: 4 });
    await repo.reassign('anon', 'real');
    expect(await repo.recentForUser('anon', 10)).toEqual([]);
    expect((await repo.recentForUser('real', 10)).map((r) => [r.roomId, r.lastRole])).toEqual([
      ['AAAAAA', 'host'],
      ['BBBBBB', 'moderator'],
    ]);
  });

  it('ignores reassigning an unknown user', async () => {
    const repo = new InMemoryMembershipRepository();
    await repo.reassign('ghost', 'real');
    expect(await repo.recentForUser('real', 10)).toEqual([]);
  });
});
