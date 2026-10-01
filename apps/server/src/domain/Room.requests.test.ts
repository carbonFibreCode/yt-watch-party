import { describe, expect, it } from 'vitest';
import { REQUEST_TTL_MS } from '@watchparty/shared';
import { DomainError } from './DomainError';
import type { Room } from './Room';
import { fullRoom, HOST, MOD, PART, T0, video } from './test/builders';

const withRequest = (): Room => {
  const room = fullRoom();
  room.createRequest(PART.userId, { type: 'seek', time: 42 }, 'r1', T0);
  room.pullEvents();
  return room;
};

describe('Room approval workflow', () => {
  it('creates a request with a deadline and announces it', () => {
    const room = fullRoom();
    const request = room.createRequest(
      PART.userId,
      { type: 'change_video', video: video(), startAt: 0 },
      'r1',
      T0,
    );
    expect(request).toMatchObject({
      id: 'r1',
      requester: { userId: PART.userId, name: PART.name },
      createdAt: T0,
      expiresAt: T0 + REQUEST_TTL_MS,
    });
    expect(room.pendingRequests()).toHaveLength(1);
    expect(room.pullEvents()).toEqual([{ type: 'RequestCreated', requestId: 'r1' }]);
  });

  it('announces a superseded request as expired', () => {
    const room = withRequest();
    room.createRequest(PART.userId, { type: 'seek', time: 60 }, 'r2', T0 + 1);
    expect(room.pullEvents()).toEqual([
      { type: 'RequestResolved', requestId: 'r1', requesterId: PART.userId, status: 'expired' },
      { type: 'RequestCreated', requestId: 'r2' },
    ]);
  });

  it('rejects requests from non-members', () => {
    expect(() => fullRoom().createRequest('ghost', { type: 'play' }, 'r1', T0)).toThrow(
      new DomainError('TARGET_NOT_FOUND'),
    );
  });

  it.each([
    [true, 'approved'],
    [false, 'rejected'],
  ] as const)('resolves with approve=%s as %s and returns the request', (approve, status) => {
    const room = withRequest();
    const request = room.resolveRequest(MOD.userId, 'r1', approve, T0 + 1_000);
    expect(request.action).toEqual({ type: 'seek', time: 42 });
    expect(room.pendingRequests()).toEqual([]);
    expect(room.pullEvents()).toEqual([
      { type: 'RequestResolved', requestId: 'r1', requesterId: PART.userId, status, resolvedBy: MOD.userId },
    ]);
  });

  it('does not execute the action itself (the command layer does)', () => {
    const room = withRequest();
    room.resolveRequest(HOST.userId, 'r1', true, T0 + 1_000);
    expect(room.playback.rev).toBe(0);
  });

  it('rejects resolving twice', () => {
    const room = withRequest();
    room.resolveRequest(HOST.userId, 'r1', true, T0 + 1_000);
    expect(() => room.resolveRequest(HOST.userId, 'r1', true, T0 + 2_000)).toThrow(
      new DomainError('REQUEST_EXPIRED'),
    );
  });

  it('expires requests past their deadline', () => {
    const room = withRequest();
    room.expireRequests(T0 + REQUEST_TTL_MS);
    expect(room.pendingRequests()).toEqual([]);
    expect(room.pullEvents()).toEqual([
      { type: 'RequestResolved', requestId: 'r1', requesterId: PART.userId, status: 'expired' },
    ]);
  });

  it("drops a requester's requests when they leave", () => {
    const room = withRequest();
    room.leave(PART.userId);
    expect(room.pendingRequests()).toEqual([]);
    expect(room.pullEvents()[0]).toEqual({
      type: 'RequestResolved',
      requestId: 'r1',
      requesterId: PART.userId,
      status: 'expired',
    });
  });

  it("drops a requester's requests when they are removed", () => {
    const room = withRequest();
    room.remove(MOD.userId, PART.userId);
    expect(room.pendingRequests()).toEqual([]);
  });

  it("drops a requester's requests once promoted to a role that no longer requests", () => {
    const room = withRequest();
    room.assignRole(HOST.userId, PART.userId, 'moderator');
    expect(room.pendingRequests()).toEqual([]);
  });

  it("drops a requester's requests when demoted to viewer, who cannot request", () => {
    const room = withRequest();
    room.assignRole(HOST.userId, PART.userId, 'viewer');
    expect(room.pendingRequests()).toEqual([]);
  });

  it("keeps other users' requests when someone's role changes", () => {
    const room = withRequest();
    room.assignRole(HOST.userId, MOD.userId, 'viewer');
    expect(room.pendingRequests().map((r) => r.id)).toEqual(['r1']);
  });

  it('drops requests of a user who becomes host', () => {
    const room = withRequest();
    room.transferHost(HOST.userId, PART.userId);
    expect(room.pendingRequests()).toEqual([]);
  });
});
