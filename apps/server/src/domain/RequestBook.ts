import { MAX_PENDING_REQUESTS_PER_USER } from '@watchparty/shared';
import type { RequestableActionType, UserId, UserRef } from '@watchparty/shared';
import { DomainError } from './DomainError';
import type { VideoRef } from './VideoRef';

/**
 * A participant's requested change in its *prepared* form: URLs are already resolved to
 * embeddable videos, so approval can execute it without further I/O (LLD SP-10).
 */
export type RequestedAction =
  | { readonly type: 'play' }
  | { readonly type: 'pause' }
  | { readonly type: 'seek'; readonly time: number }
  | { readonly type: 'change_video'; readonly video: VideoRef; readonly startAt: number }
  | { readonly type: 'queue_add'; readonly video: VideoRef };

// Compile-time guarantee that the domain union covers exactly the requestable command types.
type SameKeys<A extends string, B extends string> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
type Expect<T extends true> = T;
export type RequestedActionCoversContract = Expect<SameKeys<RequestedAction['type'], RequestableActionType>>;

export interface ActionRequest {
  readonly id: string;
  readonly requester: UserRef;
  readonly action: RequestedAction;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/** Pending participant requests (LLD SP-10). */
export class RequestBook {
  private constructor(private requests: readonly ActionRequest[]) {}

  static empty(): RequestBook {
    return new RequestBook([]);
  }

  static fromSnapshot(requests: readonly ActionRequest[]): RequestBook {
    return new RequestBook([...requests]);
  }

  toSnapshot(): readonly ActionRequest[] {
    return this.requests;
  }

  list(): readonly ActionRequest[] {
    return this.requests;
  }

  /**
   * Adds a request. An older pending request of the same type from the same user is superseded
   * (returned so the caller can announce it); the per-user cap applies after that replacement.
   */
  add(request: ActionRequest): ActionRequest | undefined {
    const superseded = this.requests.find(
      (r) => r.requester.userId === request.requester.userId && r.action.type === request.action.type,
    );
    const remaining = this.requests.filter((r) => r !== superseded);
    const pendingForUser = remaining.filter((r) => r.requester.userId === request.requester.userId).length;
    if (pendingForUser >= MAX_PENDING_REQUESTS_PER_USER) {
      throw new DomainError('RATE_LIMITED');
    }
    this.requests = [...remaining, request];
    return superseded;
  }

  /** Removes and returns a still-valid request; missing or expired ones are reported as expired. */
  take(requestId: string, now: number): ActionRequest {
    const request = this.requests.find((r) => r.id === requestId);
    if (request === undefined || request.expiresAt <= now) {
      throw new DomainError('REQUEST_EXPIRED');
    }
    this.requests = this.requests.filter((r) => r !== request);
    return request;
  }

  expire(now: number): readonly ActionRequest[] {
    return this.removeWhere((r) => r.expiresAt <= now);
  }

  removeByRequester(userId: UserId): readonly ActionRequest[] {
    return this.removeWhere((r) => r.requester.userId === userId);
  }

  private removeWhere(predicate: (request: ActionRequest) => boolean): readonly ActionRequest[] {
    const removed = this.requests.filter(predicate);
    if (removed.length > 0) {
      this.requests = this.requests.filter((r) => !predicate(r));
    }
    return removed;
  }
}
