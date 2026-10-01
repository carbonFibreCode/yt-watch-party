import { describe, expect, it } from 'vitest';
import { REQUEST_TTL_MS } from '@watchparty/shared';
import { authUser } from '../../test/fakes';
import { buildHarness, VIDEO_ID, VIDEO_URL } from '../../test/harness';
import type { Harness } from '../../test/harness';

const HOST = authUser('u-host', 'Hana');
const MOD = authUser('u-mod', 'Mo');
const PART = authUser('u-part', 'Pat');
const VIEWER = authUser('u-view', 'Vic');

/** Host, moderator, participant and viewer in one room, roles assigned through real commands. */
const party = async (h: Harness = buildHarness()) => {
  const { roomId, sessions } = await h.roomWith(HOST, MOD, PART, VIEWER);
  const [host, mod, part, viewer] = sessions as [
    (typeof sessions)[0],
    (typeof sessions)[0],
    (typeof sessions)[0],
    (typeof sessions)[0],
  ];
  await h.send(host, 'assign_role', { userId: MOD.userId, role: 'moderator' });
  await h.send(host, 'assign_role', { userId: VIEWER.userId, role: 'viewer' });
  h.broadcaster.clear();
  return { h, roomId, host, mod, part, viewer };
};

const version = async (h: Harness, roomId: string) => (await h.roomRepository.load(roomId))?.version;

describe('command handlers', () => {
  describe('playback', () => {
    it('lets a moderator control playback and broadcasts each change', async () => {
      const { h, roomId, mod } = await party();
      expect(await h.send(mod, 'change_video', { url: `${VIDEO_URL}?t=42` })).toEqual({ ok: true, data: {} });
      expect(await h.send(mod, 'pause', {})).toMatchObject({ ok: true });
      expect(await h.send(mod, 'seek', { time: 100 })).toMatchObject({ ok: true });
      expect(await h.send(mod, 'play', {})).toMatchObject({ ok: true });
      const room = await h.rooms.read(roomId);
      expect(room.playback).toMatchObject({ video: { id: VIDEO_ID }, isPlaying: true, anchorPosition: 100 });
      expect(h.broadcaster.eventTypes()).toEqual(Array.from({ length: 4 }, () => 'PlaybackChanged'));
    });

    it.each(['part', 'viewer'] as const)('forbids a %s from controlling playback', async (who) => {
      const ctx = await party();
      expect(await ctx.h.send(ctx[who], 'seek', { time: 5 })).toMatchObject({ error: { code: 'FORBIDDEN' } });
    });

    it('reports invalid and non-embeddable videos without changing state', async () => {
      const { h, host } = await party();
      h.metadata.failures.set('aaaaaaaaaaa', 'EMBED_DISABLED');
      expect(await h.send(host, 'change_video', { url: 'not a video' })).toMatchObject({
        error: { code: 'INVALID_VIDEO' },
      });
      expect(await h.send(host, 'change_video', { url: 'aaaaaaaaaaa' })).toMatchObject({
        error: { code: 'EMBED_DISABLED' },
      });
      expect(h.broadcaster.published).toEqual([]);
    });

    it('re-checks permission at commit time: a moderator demoted mid-command is refused', async () => {
      const { h, roomId, host, mod } = await party();
      h.metadata.onLookup = () => h.send(host, 'assign_role', { userId: MOD.userId, role: 'participant' });
      expect(await h.send(mod, 'change_video', { url: VIDEO_URL })).toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
      expect((await h.rooms.read(roomId)).playback.video).toBeNull();
    });

    it('records duration and advances the queue when the video ends', async () => {
      const { h, roomId, host, part } = await party();
      await h.send(host, 'change_video', { url: VIDEO_URL });
      await h.send(host, 'queue_add', { url: 'aaaaaaaaaaa' });
      await h.send(part, 'report_duration', { videoId: VIDEO_ID, duration: 60 });
      h.clock.advance(60_000);
      const { rev } = (await h.rooms.read(roomId)).playback;
      expect(await h.send(part, 'video_ended', { videoId: VIDEO_ID, rev })).toMatchObject({ ok: true });
      const room = await h.rooms.read(roomId);
      expect(room.playback.video?.id).toBe('aaaaaaaaaaa');
      expect(room.queueItems()).toEqual([]);
    });

    it('manages the queue for staff only', async () => {
      const { h, roomId, host, mod, part } = await party();
      await h.send(host, 'change_video', { url: VIDEO_URL });
      await h.send(mod, 'queue_add', { url: 'aaaaaaaaaaa' });
      const [item] = (await h.rooms.read(roomId)).queueItems();
      expect(await h.send(part, 'queue_remove', { itemId: item!.id })).toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
      expect(await h.send(mod, 'queue_remove', { itemId: item!.id })).toMatchObject({ ok: true });
      expect(await h.send(mod, 'queue_remove', { itemId: item!.id })).toMatchObject({
        error: { code: 'TARGET_NOT_FOUND' },
      });
    });
  });

  describe('approval workflow', () => {
    it('lets a participant request a change and staff approve it in a single commit', async () => {
      const { h, roomId, part, mod } = await party();
      const requested = await h.send(part, 'request_action', {
        action: { type: 'change_video', url: VIDEO_URL },
      });
      expect(requested).toMatchObject({ ok: true, data: { requestId: expect.any(String) as string } });
      expect(h.broadcaster.eventTypes()).toEqual(['RequestCreated']);
      const requestId = (requested as { data: { requestId: string } }).data.requestId;

      const before = await version(h, roomId);
      expect(await h.send(mod, 'resolve_request', { requestId, approve: true })).toMatchObject({ ok: true });
      expect(await version(h, roomId)).toBe((before ?? 0) + 1);
      expect((await h.rooms.read(roomId)).playback.video?.id).toBe(VIDEO_ID);
      expect(h.broadcaster.eventTypes().slice(1)).toEqual(['RequestResolved', 'PlaybackChanged']);
    });

    it('rejecting leaves playback untouched', async () => {
      const { h, roomId, part, host } = await party();
      const requested = await h.send(part, 'request_action', { action: { type: 'seek', time: 30 } });
      const requestId = (requested as { data: { requestId: string } }).data.requestId;
      await h.send(host, 'resolve_request', { requestId, approve: false });
      expect((await h.rooms.read(roomId)).playback.rev).toBe(0);
    });

    it('cannot resolve a request twice or after it expired', async () => {
      const { h, part, host } = await party();
      const first = await h.send(part, 'request_action', { action: { type: 'play' } });
      const second = await h.send(part, 'request_action', { action: { type: 'pause' } });
      const firstId = (first as { data: { requestId: string } }).data.requestId;
      const secondId = (second as { data: { requestId: string } }).data.requestId;
      await h.send(host, 'resolve_request', { requestId: firstId, approve: true });
      expect(await h.send(host, 'resolve_request', { requestId: firstId, approve: true })).toMatchObject({
        error: { code: 'REQUEST_EXPIRED' },
      });
      h.clock.advance(REQUEST_TTL_MS);
      expect(await h.send(host, 'resolve_request', { requestId: secondId, approve: true })).toMatchObject({
        error: { code: 'REQUEST_EXPIRED' },
      });
    });

    it('validates a requested video up front', async () => {
      const { h, part } = await party();
      expect(
        await h.send(part, 'request_action', { action: { type: 'change_video', url: 'nope' } }),
      ).toMatchObject({
        error: { code: 'INVALID_VIDEO' },
      });
    });

    it.each(['viewer', 'mod'] as const)('does not let a %s create requests', async (who) => {
      const ctx = await party();
      expect(await ctx.h.send(ctx[who], 'request_action', { action: { type: 'play' } })).toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
    });

    it('does not let participants resolve requests', async () => {
      const { h, part } = await party();
      expect(await h.send(part, 'resolve_request', { requestId: 'x', approve: true })).toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
    });
  });

  describe('moderation', () => {
    it('promotion unlocks playback for the promoted user', async () => {
      const { h, host, part } = await party();
      expect(await h.send(part, 'pause', {})).toMatchObject({ error: { code: 'FORBIDDEN' } });
      await h.send(host, 'assign_role', { userId: PART.userId, role: 'moderator' });
      expect(await h.send(part, 'pause', {})).toMatchObject({ ok: true });
    });

    it('only the host assigns roles', async () => {
      const { h, mod } = await party();
      expect(await h.send(mod, 'assign_role', { userId: PART.userId, role: 'viewer' })).toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
    });

    it('cannot assign the host role', async () => {
      const { h, host } = await party();
      expect(await h.send(host, 'assign_role', { userId: PART.userId, role: 'host' })).toMatchObject({
        error: { code: 'VALIDATION_FAILED' },
      });
    });

    it('removal bans the user: their socket is refused and rejoining fails', async () => {
      const { h, roomId, mod, part } = await party();
      expect(await h.send(mod, 'remove_participant', { userId: PART.userId })).toMatchObject({ ok: true });
      expect(h.broadcaster.eventTypes()).toEqual(['ParticipantRemoved']);
      expect(await h.send(part, 'chat_message', { text: 'hello?' })).toMatchObject({
        error: { code: 'NOT_IN_ROOM' },
      });
      expect(await h.send(part, 'join_room', { roomId })).toMatchObject({ error: { code: 'BANNED' } });
    });

    it('a moderator cannot remove the host', async () => {
      const { h, mod } = await party();
      expect(await h.send(mod, 'remove_participant', { userId: HOST.userId })).toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
    });

    it('transfers host', async () => {
      const { h, roomId, host, mod } = await party();
      expect(await h.send(mod, 'transfer_host', { userId: PART.userId })).toMatchObject({
        error: { code: 'FORBIDDEN' },
      });
      expect(await h.send(host, 'transfer_host', { userId: PART.userId })).toMatchObject({ ok: true });
      expect((await h.rooms.read(roomId)).hostId).toBe(PART.userId);
    });
  });

  describe('membership', () => {
    it('joins with a full room view and refuses unknown rooms', async () => {
      const { h, roomId } = await party();
      const late = h.session('u-late', 'Lou');
      expect(await h.send(late, 'join_room', { roomId: roomId.toLowerCase() })).toMatchObject({
        ok: true,
        data: { room: { id: roomId, self: { role: 'participant' } } },
      });
      expect(await h.send(h.session('u-x'), 'join_room', { roomId: 'ZZZZZZ' })).toMatchObject({
        error: { code: 'ROOM_NOT_FOUND' },
      });
    });

    it('leaves only the room the socket is in', async () => {
      const { h, roomId, part } = await party();
      expect(await h.send(part, 'leave_room', { roomId: 'ZZZZZZ' })).toMatchObject({
        error: { code: 'NOT_IN_ROOM' },
      });
      expect(await h.send(part, 'leave_room', { roomId })).toMatchObject({ ok: true });
      expect((await h.rooms.read(roomId)).participant(PART.userId)).toBeUndefined();
    });
  });

  describe('side channels', () => {
    it('chat is persisted and broadcast; viewers may chat', async () => {
      const { h, roomId, viewer } = await party();
      expect(await h.send(viewer, 'chat_message', { text: '  hi all  ' })).toMatchObject({ ok: true });
      expect(h.broadcaster.sent).toMatchObject([
        { roomId, event: 'chat_message', payload: { text: 'hi all' } },
      ]);
      expect(await h.chat.history(roomId)).toHaveLength(1);
    });

    it('reactions are broadcast with the sender and video time, not persisted', async () => {
      const { h, roomId, part } = await party();
      expect(await h.send(part, 'reaction', { emoji: '🎉', videoTime: 12.5 })).toMatchObject({ ok: true });
      expect(h.broadcaster.sent).toMatchObject([
        {
          roomId,
          event: 'reaction',
          payload: { userId: PART.userId, name: 'Pat', emoji: '🎉', videoTime: 12.5 },
        },
      ]);
      expect(h.broadcaster.published).toEqual([]);
    });
  });
});
