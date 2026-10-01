import { describe, expect, it } from 'vitest';
import { ClientEventSchemas, EMPTY_ACK, RATE_LIMITS } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import { authUser, FakeSession } from '../test/fakes';
import { buildHarness } from '../test/harness';
import type { CommandContext, CommandHandler } from './CommandHandler';
import { CommandRegistry } from './CommandRegistry';

const HOST = authUser('u-host', 'Hana');
const GUEST = authUser('u-guest', 'Gus');

/** A handler written only against the CommandHandler interface (OCP: no pipeline edits needed). */
class ProbeReaction implements CommandHandler<'reaction'> {
  readonly event = 'reaction';
  readonly schema = ClientEventSchemas.reaction;
  readonly capability = 'reaction.send';
  readonly requiresMembership = true;
  readonly rateRule = 'reaction';
  readonly seen: { payload: ClientPayload<'reaction'>; actorId: string | undefined }[] = [];

  constructor(private readonly failWith?: Error) {}

  handle(payload: ClientPayload<'reaction'>, ctx: CommandContext): Promise<EmptyAck> {
    if (this.failWith !== undefined) {
      return Promise.reject(this.failWith);
    }
    this.seen.push({ payload, actorId: ctx.actor?.userId });
    return Promise.resolve(EMPTY_ACK);
  }
}

describe('CommandPipeline', () => {
  it('treats unknown events as malformed input', async () => {
    const h = buildHarness();
    expect(await h.registry.dispatch('drop_tables', {}, h.session('u1'))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('rejects payloads that fail the contract', async () => {
    const h = buildHarness();
    const { sessions } = await h.roomWith(HOST);
    expect(await h.send(sessions[0]!, 'seek', { time: -5 })).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(await h.send(sessions[0]!, 'play', { userId: 'spoofed' })).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('validates before rate limiting, so malformed spam does not drain the bucket', async () => {
    const h = buildHarness();
    const { sessions } = await h.roomWith(HOST);
    for (let i = 0; i < RATE_LIMITS.playback.points * 2; i += 1) {
      await h.send(sessions[0]!, 'seek', { time: 'soon' });
    }
    expect(await h.send(sessions[0]!, 'seek', { time: 1 })).toMatchObject({ ok: true });
  });

  it('rate limits per rule and logs the rejection as a warning', async () => {
    const h = buildHarness();
    const { sessions } = await h.roomWith(HOST);
    for (let i = 0; i < RATE_LIMITS.playback.points; i += 1) {
      expect(await h.send(sessions[0]!, 'seek', { time: i })).toMatchObject({ ok: true });
    }
    expect(await h.send(sessions[0]!, 'seek', { time: 99 })).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
    expect(h.logger.entries.at(-1)).toMatchObject({ level: 'warn', fields: { errorCode: 'RATE_LIMITED' } });
  });

  it('requires an attached room for room commands', async () => {
    const h = buildHarness();
    expect(await h.send(h.session('u1'), 'play', {})).toMatchObject({ error: { code: 'NOT_IN_ROOM' } });
  });

  it('rejects a socket whose user is no longer a member', async () => {
    const h = buildHarness();
    const { roomId, sessions } = await h.roomWith(HOST, GUEST);
    await h.rooms.mutate(roomId, (room) => {
      room.remove(HOST.userId, GUEST.userId);
    });
    expect(await h.send(sessions[1]!, 'chat_message', { text: 'still here?' })).toMatchObject({
      error: { code: 'NOT_IN_ROOM' },
    });
  });

  it('rejects missing capabilities with FORBIDDEN before running the handler', async () => {
    const h = buildHarness();
    const { sessions } = await h.roomWith(HOST, GUEST);
    h.metadata.onLookup = () => {
      throw new Error('prepare must not run for a forbidden command');
    };
    expect(await h.send(sessions[1]!, 'change_video', { url: 'dQw4w9WgXcQ' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  });

  it('allows commands that need no membership', async () => {
    const h = buildHarness();
    expect(await h.send(h.session('u1'), 'timesync', { jsonrpc: '2.0', id: 7, method: 'timesync' })).toEqual({
      ok: true,
      data: { jsonrpc: '2.0', id: 7, result: h.clock.now() },
    });
  });

  it('runs any handler that implements the interface, enforcing its declared policy (OCP)', async () => {
    const h = buildHarness();
    const { sessions } = await h.roomWith(HOST);
    const probe = new ProbeReaction();
    const registry = new CommandRegistry(h.pipeline).register(probe);
    expect(await registry.dispatch('reaction', { emoji: '🔥', videoTime: 3 }, sessions[0]!)).toMatchObject({
      ok: true,
    });
    expect(
      await registry.dispatch('reaction', { emoji: '🔥', videoTime: 3 }, new FakeSession(GUEST)),
    ).toMatchObject({
      error: { code: 'NOT_IN_ROOM' },
    });
    expect(probe.seen).toEqual([{ payload: { emoji: '🔥', videoTime: 3 }, actorId: HOST.userId }]);
  });

  it('maps unexpected errors to INTERNAL and logs them', async () => {
    const h = buildHarness();
    const { sessions } = await h.roomWith(HOST);
    const boom = new Error('boom');
    const registry = new CommandRegistry(h.pipeline).register(new ProbeReaction(boom));
    expect(await registry.dispatch('reaction', { emoji: '🔥', videoTime: 3 }, sessions[0]!)).toMatchObject({
      error: { code: 'INTERNAL' },
    });
    expect(h.logger.entries.at(-1)).toMatchObject({ level: 'error', fields: { err: boom } });
  });

  it('logs successful commands at debug with timing', async () => {
    const h = buildHarness();
    const { sessions } = await h.roomWith(HOST);
    await h.send(sessions[0]!, 'pause', {});
    expect(h.logger.entries.at(-1)).toMatchObject({
      level: 'debug',
      fields: { event: 'pause', outcome: 'ok', durationMs: 0 },
    });
  });
});
