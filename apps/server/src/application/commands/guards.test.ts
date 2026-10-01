import { describe, expect, it } from 'vitest';
import { DomainError } from '../../domain/DomainError';
import type { Participant } from '../../domain/Participant';
import { authUser, FakeSession } from '../test/fakes';
import { authorize } from './middleware/authorize';
import { requireActor } from './requireActor';

const MEMBER: Participant = {
  userId: 'u1',
  name: 'Pat',
  role: 'participant',
  presence: 'online',
  awaySince: null,
  joinedAt: 0,
};

describe('authorization guards', () => {
  it('authorize skips handlers without a capability', () => {
    expect(() => {
      authorize({ capability: null, requiresMembership: false, rateRule: 'join' }, null);
    }).not.toThrow();
  });

  it('authorize refuses a capability check without a resolved actor', () => {
    expect(() => {
      authorize({ capability: 'chat.send', requiresMembership: true, rateRule: 'chat' }, null);
    }).toThrow(new DomainError('NOT_IN_ROOM'));
  });

  it('authorize enforces the capability on the actor', () => {
    expect(() => {
      authorize({ capability: 'playback.control', requiresMembership: true, rateRule: 'playback' }, MEMBER);
    }).toThrow(new DomainError('FORBIDDEN'));
  });

  it('requireActor refuses a context without an actor (handler invoked outside the pipeline)', () => {
    const session = new FakeSession(authUser('u1'));
    expect(() => requireActor({ session, user: session.user, actor: null })).toThrow(
      new DomainError('NOT_IN_ROOM'),
    );
    expect(requireActor({ session, user: session.user, actor: MEMBER })).toBe(MEMBER);
  });
});
