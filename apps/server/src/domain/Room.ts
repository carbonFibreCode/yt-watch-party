import {
  END_TOLERANCE_S,
  GRACE_PERIOD_MS,
  MAX_PENDING_REQUESTS_PER_USER,
  PermissionPolicy,
  REQUEST_TTL_MS,
  ROOM_CAPACITY,
} from '@watchparty/shared';
import type {
  AssignableRole,
  LeaveReason,
  Role,
  RoomCode,
  UserId,
  UserRef,
  VideoId,
} from '@watchparty/shared';
import { DomainError, InvariantViolation } from './DomainError';
import type { DomainEvent } from './events';
import { MemberRegistry } from './MemberRegistry';
import type { Participant } from './Participant';
import { PlaybackState } from './PlaybackState';
import { RequestBook } from './RequestBook';
import type { ActionRequest, RequestedAction } from './RequestBook';
import type { RoomSnapshot } from './snapshot';
import { VideoQueue } from './VideoQueue';
import type { QueueItem } from './VideoQueue';
import type { VideoRef } from './VideoRef';

export interface CreateRoomParams {
  readonly id: RoomCode;
  readonly name: string;
  readonly host: UserRef;
  readonly now: number;
}

export interface JoinResult {
  readonly participant: Participant;
  /** False when the user was already a member (another tab, or reconnecting within grace). */
  readonly isNew: boolean;
}

/**
 * Aggregate root (LLD SP-4): the single consistency boundary for members, roles, playback,
 * queue and pending requests. Pure: time and ids are passed in, nothing is read from the outside.
 *
 * Capability checks ("may a moderator seek at all?") happen in the command pipeline; this class
 * enforces relational rules ("may this actor act on that target?") and all invariants.
 */
export class Room {
  private readonly pending: DomainEvent[] = [];

  private constructor(
    readonly id: RoomCode,
    private readonly roomName: string,
    private currentHostId: UserId,
    readonly createdAt: number,
    readonly version: number,
    private readonly members: MemberRegistry,
    private playbackState: PlaybackState,
    private readonly queue: VideoQueue,
    private readonly requests: RequestBook,
  ) {}

  /**
   * The creator is admitted as host but "away" until their socket joins, so a room whose
   * creator never connects is handed over by the normal grace/succession path.
   */
  static create({ id, name, host, now }: CreateRoomParams): Room {
    const members = MemberRegistry.empty();
    members.admit(host, 'host', now);
    members.update(host.userId, { presence: 'away', awaySince: now });
    return new Room(
      id,
      name,
      host.userId,
      now,
      0,
      members,
      PlaybackState.idle(now),
      VideoQueue.empty(),
      RequestBook.empty(),
    );
  }

  static fromSnapshot(s: RoomSnapshot): Room {
    return new Room(
      s.id,
      s.name,
      s.hostId,
      s.createdAt,
      s.version,
      MemberRegistry.fromSnapshot(s.members),
      PlaybackState.fromSnapshot(s.playback),
      VideoQueue.fromSnapshot(s.queue),
      RequestBook.fromSnapshot(s.requests),
    );
  }

  toSnapshot(): RoomSnapshot {
    this.assertInvariants();
    return {
      id: this.id,
      name: this.roomName,
      hostId: this.currentHostId,
      createdAt: this.createdAt,
      version: this.version,
      members: this.members.toSnapshot(),
      playback: this.playbackState.toSnapshot(),
      queue: this.queue.toSnapshot(),
      requests: this.requests.toSnapshot(),
    };
  }

  // ---------------------------------------------------------------- reads

  get name(): string {
    return this.roomName;
  }

  get hostId(): UserId {
    return this.currentHostId;
  }

  get playback(): PlaybackState {
    return this.playbackState;
  }

  participants(): readonly Participant[] {
    return this.members.list();
  }

  participant(userId: UserId): Participant | undefined {
    return this.members.get(userId);
  }

  queueItems(): readonly QueueItem[] {
    return this.queue.list();
  }

  pendingRequests(): readonly ActionRequest[] {
    return this.requests.list();
  }

  /** Drains the events produced since the last call. */
  pullEvents(): DomainEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  // ---------------------------------------------------------------- membership

  join(user: UserRef, now: number): JoinResult {
    if (this.members.isBanned(user.userId)) {
      throw new DomainError('BANNED');
    }
    const existing = this.members.get(user.userId);
    if (existing !== undefined) {
      return { participant: this.reconnect(existing, user.name), isNew: false };
    }
    const role = this.roleForNewcomer(user.userId);
    const participant = this.members.admit(user, role, now);
    if (role === 'host') {
      this.currentHostId = participant.userId;
    }
    this.emit({ type: 'ParticipantJoined', userId: participant.userId, name: participant.name, role });
    return { participant, isNew: true };
  }

  markAway(userId: UserId, now: number): void {
    const member = this.members.require(userId);
    if (member.presence === 'away') {
      return;
    }
    this.members.update(userId, { presence: 'away', awaySince: now });
    this.emit({ type: 'PresenceChanged', userId, presence: 'away' });
  }

  leave(userId: UserId): void {
    this.members.require(userId);
    const previousHostId = this.currentHostId;
    this.depart(userId, 'left');
    this.ensureHost(previousHostId);
  }

  /** Removes members whose grace period ran out; safe to call on every mutation (LLD SP-9). */
  reapAway(now: number): void {
    const expired = this.members.awayLongerThan(GRACE_PERIOD_MS, now);
    if (expired.length === 0) {
      return;
    }
    const previousHostId = this.currentHostId;
    for (const member of expired) {
      this.depart(member.userId, 'timeout');
    }
    this.ensureHost(previousHostId);
  }

  remove(actorId: UserId, targetId: UserId): void {
    const { actor, target } = this.relate(actorId, targetId);
    this.members.release(target.userId);
    this.members.ban(target.userId);
    this.dropRequestsOf(target.userId);
    this.emit({ type: 'ParticipantRemoved', userId: target.userId, name: target.name, byRole: actor.role });
  }

  assignRole(actorId: UserId, targetId: UserId, role: AssignableRole): void {
    const { target } = this.relate(actorId, targetId);
    if (target.role === role) {
      return;
    }
    this.members.update(target.userId, { role });
    if (!PermissionPolicy.can(role, 'request.create')) {
      this.dropRequestsOf(target.userId);
    }
    this.emit({
      type: 'RoleAssigned',
      userId: target.userId,
      name: target.name,
      role,
      previousRole: target.role,
    });
  }

  transferHost(actorId: UserId, targetId: UserId): void {
    const actor = this.members.require(actorId);
    if (actor.role !== 'host' || actorId === targetId) {
      throw new DomainError('FORBIDDEN');
    }
    const target = this.members.require(targetId);
    if (target.presence !== 'online') {
      throw new DomainError('TARGET_OFFLINE');
    }
    this.members.update(actorId, { role: 'moderator' });
    this.members.update(targetId, { role: 'host' });
    this.currentHostId = targetId;
    this.dropRequestsOf(targetId);
    this.emit({ type: 'HostTransferred', fromUserId: actorId, toUserId: targetId, reason: 'manual' });
  }

  // ---------------------------------------------------------------- playback

  play(now: number): void {
    this.applyPlayback(this.playbackState.play(now));
  }

  pause(now: number): void {
    this.applyPlayback(this.playbackState.pause(now));
  }

  seek(time: number, now: number): void {
    this.applyPlayback(this.playbackState.seek(time, now));
  }

  changeVideo(video: VideoRef, startAt: number, now: number): void {
    this.applyPlayback(this.playbackState.load(video, startAt, now, true));
  }

  /** Loads a video paused, e.g. the initial video of a new room, so it does not play to an empty room. */
  cueVideo(video: VideoRef, startAt: number, now: number): void {
    this.applyPlayback(this.playbackState.load(video, startAt, now, false));
  }

  reportDuration(videoId: VideoId, duration: number): void {
    this.playbackState = this.playbackState.withDuration(videoId, duration);
  }

  /**
   * Accepts the first valid "ended" report for the current video/revision and advances the
   * queue; stale, early or duplicate reports are ignored (idempotent, LLD SP-5).
   */
  videoEnded(videoId: VideoId, rev: number, now: number): void {
    const playback = this.playbackState;
    const isCurrent = playback.video?.id === videoId && playback.rev === rev;
    if (!isCurrent || playback.duration === null) {
      return;
    }
    if (playback.positionAt(now) < playback.duration - END_TOLERANCE_S) {
      return;
    }
    const next = this.queue.shift();
    if (next === undefined) {
      this.applyPlayback(playback.finish(now));
      return;
    }
    this.applyPlayback(playback.load(next.video, 0, now, true));
    this.emit({ type: 'QueueChanged' });
  }

  // ---------------------------------------------------------------- queue

  /** Adding to an idle room starts the video right away instead of queueing it. */
  enqueue(item: QueueItem, now: number): void {
    if (this.playbackState.video === null) {
      this.changeVideo(item.video, 0, now);
      return;
    }
    this.queue.add(item);
    this.emit({ type: 'QueueChanged' });
  }

  dequeue(itemId: string): void {
    this.queue.remove(itemId);
    this.emit({ type: 'QueueChanged' });
  }

  // ---------------------------------------------------------------- approval workflow

  createRequest(requesterId: UserId, action: RequestedAction, requestId: string, now: number): ActionRequest {
    const requester = this.members.require(requesterId);
    const request: ActionRequest = {
      id: requestId,
      requester: { userId: requester.userId, name: requester.name },
      action,
      createdAt: now,
      expiresAt: now + REQUEST_TTL_MS,
    };
    const superseded = this.requests.add(request);
    if (superseded !== undefined) {
      this.emitResolved(superseded, 'expired');
    }
    this.emit({ type: 'RequestCreated', requestId });
    return request;
  }

  /** Removes the request and records the decision; executing an approved action is the caller's job. */
  resolveRequest(actorId: UserId, requestId: string, approve: boolean, now: number): ActionRequest {
    this.members.require(actorId);
    const request = this.requests.take(requestId, now);
    this.emitResolved(request, approve ? 'approved' : 'rejected', actorId);
    return request;
  }

  expireRequests(now: number): void {
    for (const request of this.requests.expire(now)) {
      this.emitResolved(request, 'expired');
    }
  }

  // ---------------------------------------------------------------- internals

  private emit(event: DomainEvent): void {
    this.pending.push(event);
  }

  private emitResolved(
    request: ActionRequest,
    status: 'approved' | 'rejected' | 'expired',
    resolvedBy?: UserId,
  ): void {
    this.emit({
      type: 'RequestResolved',
      requestId: request.id,
      requesterId: request.requester.userId,
      status,
      ...(resolvedBy === undefined ? {} : { resolvedBy }),
    });
  }

  private applyPlayback(next: PlaybackState): void {
    if (next === this.playbackState) {
      return;
    }
    this.playbackState = next;
    this.emit({ type: 'PlaybackChanged' });
  }

  private reconnect(member: Participant, name: string): Participant {
    const updated = this.members.update(member.userId, { name, presence: 'online', awaySince: null });
    if (member.presence === 'away') {
      this.emit({ type: 'PresenceChanged', userId: member.userId, presence: 'online' });
    }
    return updated;
  }

  /** Hostless room → newcomer hosts; former host → moderator; otherwise their remembered role. */
  private roleForNewcomer(userId: UserId): Role {
    if (this.members.host() === undefined) {
      return 'host';
    }
    const remembered = this.members.rememberedRole(userId);
    return remembered === 'host' ? 'moderator' : (remembered ?? 'participant');
  }

  private relate(actorId: UserId, targetId: UserId): { actor: Participant; target: Participant } {
    const actor = this.members.require(actorId);
    const target = this.members.require(targetId);
    if (!PermissionPolicy.canActOn(actor.role, target.role, actorId === targetId)) {
      throw new DomainError('FORBIDDEN');
    }
    return { actor, target };
  }

  private depart(userId: UserId, reason: LeaveReason): void {
    const member = this.members.release(userId);
    this.dropRequestsOf(userId);
    this.emit({ type: 'ParticipantLeft', userId, name: member.name, reason });
  }

  private ensureHost(previousHostId: UserId): void {
    if (this.members.host() !== undefined) {
      return;
    }
    const successor = this.members.pickSuccessor();
    if (successor === undefined) {
      return;
    }
    this.members.update(successor.userId, { role: 'host' });
    this.currentHostId = successor.userId;
    this.dropRequestsOf(successor.userId);
    this.emit({
      type: 'HostTransferred',
      fromUserId: previousHostId,
      toUserId: successor.userId,
      reason: 'succession',
    });
  }

  private dropRequestsOf(userId: UserId): void {
    for (const request of this.requests.removeByRequester(userId)) {
      this.emitResolved(request, 'expired');
    }
  }

  private assertInvariants(): void {
    const members = this.members.list();
    const hosts = members.filter((m) => m.role === 'host');
    if (members.length > 0 && (hosts.length !== 1 || hosts[0]?.userId !== this.currentHostId)) {
      throw new InvariantViolation(`room ${this.id}: expected exactly one host matching hostId`);
    }
    if (members.some((m) => this.members.isBanned(m.userId))) {
      throw new InvariantViolation(`room ${this.id}: banned user is a member`);
    }
    if (members.length > ROOM_CAPACITY) {
      throw new InvariantViolation(`room ${this.id}: capacity exceeded`);
    }
    const perUser = new Map<UserId, number>();
    for (const request of this.requests.list()) {
      const count = (perUser.get(request.requester.userId) ?? 0) + 1;
      if (count > MAX_PENDING_REQUESTS_PER_USER) {
        throw new InvariantViolation(`room ${this.id}: too many pending requests`);
      }
      perUser.set(request.requester.userId, count);
    }
  }
}
