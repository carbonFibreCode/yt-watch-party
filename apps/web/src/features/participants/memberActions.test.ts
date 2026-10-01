import { describe, expect, it } from 'vitest';
import type { ParticipantView, Role } from '@watchparty/shared';
import { memberActions } from './memberActions';

const person = (userId: string, role: Role, presence: 'online' | 'away' = 'online'): ParticipantView => ({
  userId,
  name: userId,
  role,
  presence,
  joinedAt: 0,
});

const kinds = (self: ParticipantView, target: ParticipantView) =>
  memberActions(self, target).map((a) => (a.kind === 'assign' ? `assign:${a.role}` : a.kind));

describe('memberActions', () => {
  it('offers the host every other role, transfer and removal', () => {
    expect(kinds(person('h', 'host'), person('p', 'participant'))).toEqual([
      'assign:moderator',
      'assign:viewer',
      'transfer',
      'remove',
    ]);
    expect(kinds(person('h', 'host'), person('m', 'moderator'))).toEqual([
      'assign:participant',
      'assign:viewer',
      'transfer',
      'remove',
    ]);
  });

  it('does not offer transfer to someone who is away', () => {
    expect(kinds(person('h', 'host'), person('p', 'participant', 'away'))).not.toContain('transfer');
  });

  it('lets a moderator remove participants and viewers only', () => {
    expect(kinds(person('m', 'moderator'), person('p', 'participant'))).toEqual(['remove']);
    expect(kinds(person('m', 'moderator'), person('v', 'viewer'))).toEqual(['remove']);
    expect(kinds(person('m', 'moderator'), person('m2', 'moderator'))).toEqual([]);
    expect(kinds(person('m', 'moderator'), person('h', 'host'))).toEqual([]);
  });

  it('offers nothing to participants and viewers, or on yourself', () => {
    expect(kinds(person('p', 'participant'), person('v', 'viewer'))).toEqual([]);
    expect(kinds(person('v', 'viewer'), person('p', 'participant'))).toEqual([]);
    expect(kinds(person('h', 'host'), person('h', 'host'))).toEqual([]);
  });
});
