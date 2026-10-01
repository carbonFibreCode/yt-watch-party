import { describe, expect, it } from 'vitest';
import { MAX_PENDING_REQUESTS_PER_USER, REQUEST_TTL_MS } from '@watchparty/shared';
import { DomainError } from './DomainError';
import { RequestBook } from './RequestBook';
import type { ActionRequest, RequestedAction } from './RequestBook';
import { PART, T0, VIEWER, video } from './test/builders';

const request = (id: string, action: RequestedAction, requester = PART, createdAt = T0): ActionRequest => ({
  id,
  requester,
  action,
  createdAt,
  expiresAt: createdAt + REQUEST_TTL_MS,
});

describe('RequestBook', () => {
  it('adds requests and lists them', () => {
    const book = RequestBook.empty();
    expect(book.add(request('r1', { type: 'play' }))).toBeUndefined();
    expect(book.list().map((r) => r.id)).toEqual(['r1']);
  });

  it('supersedes an older request of the same type from the same user', () => {
    const book = RequestBook.empty();
    book.add(request('r1', { type: 'seek', time: 10 }));
    const superseded = book.add(request('r2', { type: 'seek', time: 20 }));
    expect(superseded?.id).toBe('r1');
    expect(book.list().map((r) => r.id)).toEqual(['r2']);
  });

  it('does not supersede requests from other users', () => {
    const book = RequestBook.empty();
    book.add(request('r1', { type: 'play' }, PART));
    expect(book.add(request('r2', { type: 'play' }, VIEWER))).toBeUndefined();
    expect(book.list()).toHaveLength(2);
  });

  it(`caps pending requests per user at ${String(MAX_PENDING_REQUESTS_PER_USER)}`, () => {
    const book = RequestBook.empty();
    book.add(request('r1', { type: 'play' }));
    book.add(request('r2', { type: 'seek', time: 1 }));
    book.add(request('r3', { type: 'change_video', video: video(), startAt: 0 }));
    expect(() => book.add(request('r4', { type: 'queue_add', video: video() }))).toThrow(
      new DomainError('RATE_LIMITED'),
    );
  });

  it('still allows a superseding request when the user is at the cap', () => {
    const book = RequestBook.empty();
    book.add(request('r1', { type: 'play' }));
    book.add(request('r2', { type: 'seek', time: 1 }));
    book.add(request('r3', { type: 'pause' }));
    expect(book.add(request('r4', { type: 'seek', time: 2 }))?.id).toBe('r2');
  });

  describe('take', () => {
    it('removes and returns a valid request', () => {
      const book = RequestBook.fromSnapshot([request('r1', { type: 'play' })]);
      expect(book.take('r1', T0 + 1).id).toBe('r1');
      expect(book.list()).toHaveLength(0);
    });

    it('reports unknown requests as expired', () => {
      expect(() => RequestBook.empty().take('nope', T0)).toThrow(new DomainError('REQUEST_EXPIRED'));
    });

    it('reports requests past their deadline as expired', () => {
      const book = RequestBook.fromSnapshot([request('r1', { type: 'play' })]);
      expect(() => book.take('r1', T0 + REQUEST_TTL_MS)).toThrow(new DomainError('REQUEST_EXPIRED'));
    });
  });

  it('expires requests at their deadline', () => {
    const book = RequestBook.fromSnapshot([
      request('old', { type: 'play' }, PART, T0),
      request('new', { type: 'play' }, VIEWER, T0 + 30_000),
    ]);
    expect(book.expire(T0 + REQUEST_TTL_MS).map((r) => r.id)).toEqual(['old']);
    expect(book.list().map((r) => r.id)).toEqual(['new']);
  });

  it('removes every request of a requester', () => {
    const book = RequestBook.fromSnapshot([
      request('a', { type: 'play' }, PART),
      request('b', { type: 'pause' }, PART),
      request('c', { type: 'play' }, VIEWER),
    ]);
    expect(book.removeByRequester(PART.userId).map((r) => r.id)).toEqual(['a', 'b']);
    expect(book.list().map((r) => r.id)).toEqual(['c']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(RequestBook.empty().expire(T0)).toEqual([]);
  });
});
