import { describe, expect, it } from 'vitest';
import { FakeClock, FakePlayer } from '@/test/FakePlayer';
import type { PlaybackView } from '@watchparty/shared';
import { DEFAULT_SYNC_CONFIG, SyncEngine } from './SyncEngine';
import type { SyncEngineOutput, SyncStatus } from './SyncEngine';

const VIDEO = 'dQw4w9WgXcQ';
const OTHER = 'aaaaaaaaaaa';
const { postSeekCooldownMs, autoplayDetectMs, seekThresholdS } = DEFAULT_SYNC_CONFIG;

const setup = () => {
  const clock = new FakeClock();
  const player = new FakePlayer(clock);
  const events = {
    statuses: [] as SyncStatus[],
    durations: [] as [string, number][],
    ended: [] as [string, number][],
    drifts: [] as (number | null)[],
  };
  const output: SyncEngineOutput = {
    durationKnown: (id, d) => events.durations.push([id, d]),
    ended: (id, rev) => events.ended.push([id, rev]),
    statusChanged: (s) => events.statuses.push(s),
    driftMeasured: (d) => events.drifts.push(d),
  };
  const engine = new SyncEngine(player, clock, output);
  /** Room state as the server would send it right now. */
  const state = (overrides: Partial<PlaybackView> = {}): PlaybackView => ({
    videoId: VIDEO,
    video: null,
    playState: 'playing',
    currentTime: 0,
    serverTime: clock.now(),
    duration: null,
    rev: 1,
    ...overrides,
  });
  /** Let the post-load/seek cooldown pass, then check. */
  const settle = async () => {
    clock.advance(postSeekCooldownMs);
    await engine.tick();
  };
  return { clock, player, engine, events, state, settle };
};

describe('SyncEngine', () => {
  it('stays idle without a video', async () => {
    const { engine, player, state, events } = setup();
    await engine.apply(state({ videoId: null, playState: 'idle' }));
    expect(player.calls).toEqual([]);
    expect(engine.status).toBe('idle');
    expect(events.drifts).toEqual([null]);
  });

  it('loads the video at the server-projected position, playing', async () => {
    const { engine, player, state, clock } = setup();
    await engine.apply(state({ currentTime: 30, serverTime: clock.now() - 2_000 }));
    expect(player.calls).toEqual([`load:${VIDEO}@32.0:true`]);
    expect(engine.status).toBe('loading');
  });

  it('cues paused when the room is paused', async () => {
    const { engine, player, state } = setup();
    await engine.apply(state({ playState: 'paused', currentTime: 10 }));
    expect(player.calls).toEqual([`load:${VIDEO}@10.0:false`]);
  });

  it('reaches in_sync and does nothing while within the drift threshold', async () => {
    const { engine, player, state, settle } = setup();
    await engine.apply(state());
    player.drift(seekThresholdS * 0.8);
    await settle();
    expect(player.calls).toEqual([`load:${VIDEO}@0.0:true`]);
    expect(engine.status).toBe('in_sync');
  });

  it('seeks back to the expected position when drift exceeds the threshold', async () => {
    const { engine, player, state, settle, events, clock } = setup();
    await engine.apply(state());
    await settle();
    player.drift(-3);
    clock.advance(500);
    await engine.tick();
    const expected = (postSeekCooldownMs + 500) / 1000;
    expect(player.calls.at(-1)).toBe(`seek:${expected.toFixed(1)}`);
    expect(events.drifts.at(-1)).toBeCloseTo(-3, 5);
  });

  it('learns the player’s buffering lag and leads later seeks by it, converging on the room', async () => {
    const { engine, player, state, settle, events } = setup();
    player.seekLagMs = 800;
    await engine.apply(state());
    for (let i = 0; i < 8; i += 1) {
      await settle();
    }
    expect(Math.abs(events.drifts.at(-1) ?? 1)).toBeLessThan(seekThresholdS);
    const calls = player.calls.length;
    await settle();
    await settle();
    expect(player.calls).toHaveLength(calls);
  });

  it('ignores outlier measurements (e.g. a very slow first load) when learning', async () => {
    const { engine, player, state, clock } = setup();
    player.seekLagMs = 10_000;
    await engine.apply(state());
    clock.advance(4_000);
    await engine.tick();
    // 4 s behind is an outlier: corrected without learning, so the seek goes to the exact position.
    expect(player.calls.at(-1)).toBe('seek:4.0');
  });

  it('does not learn a lead from paused seeks', async () => {
    const { engine, player, state, settle, clock } = setup();
    player.seekLagMs = 800;
    await engine.apply(state({ playState: 'paused', currentTime: 10 }));
    await settle();
    await engine.apply(state({ playState: 'paused', currentTime: 50, serverTime: clock.now(), rev: 2 }));
    expect(player.calls.at(-1)).toBe('seek:50.0');
  });

  it('does not correct again during the post-seek cooldown', async () => {
    const { engine, player, state, settle, clock } = setup();
    await engine.apply(state());
    await settle();
    player.drift(5);
    await engine.tick();
    const calls = player.calls.length;
    player.drift(5);
    clock.advance(postSeekCooldownMs - 1);
    await engine.tick();
    expect(player.calls).toHaveLength(calls);
  });

  it('applies a seek from the room', async () => {
    const { engine, player, state, settle, clock } = setup();
    await engine.apply(state());
    await settle();
    await engine.apply(state({ currentTime: 120, serverTime: clock.now(), rev: 2 }));
    expect(player.calls.at(-1)).toBe('seek:120.0');
  });

  it('pauses and resumes with the room', async () => {
    const { engine, player, state, settle, clock } = setup();
    await engine.apply(state());
    await settle();
    await engine.apply(state({ playState: 'paused', currentTime: 1.5, rev: 2 }));
    expect(player.state).toBe('paused');
    clock.advance(10_000);
    await engine.apply(state({ playState: 'playing', currentTime: 1.5, serverTime: clock.now(), rev: 3 }));
    expect(player.state).toBe('playing');
    expect(player.calls.slice(-2)).toEqual(['pause', 'play']);
  });

  it('pauses immediately even during the cooldown', async () => {
    const { engine, player, state } = setup();
    await engine.apply(state());
    await engine.apply(state({ playState: 'paused', rev: 2 }));
    expect(player.calls).toContain('pause');
  });

  it('ignores stale revisions of the same video', async () => {
    const { engine, player, state, settle } = setup();
    await engine.apply(state({ rev: 5 }));
    await settle();
    const calls = player.calls.length;
    await engine.apply(state({ playState: 'paused', rev: 4 }));
    await engine.apply(state({ playState: 'paused', rev: 5 }));
    expect(player.calls).toHaveLength(calls);
  });

  it('loads a new video when the room changes video', async () => {
    const { engine, player, state } = setup();
    await engine.apply(state());
    await engine.apply(state({ videoId: OTHER, currentTime: 7, rev: 2 }));
    expect(player.calls.at(-1)).toBe(`load:${OTHER}@7.0:true`);
  });

  it('falls back to muted playback when unmuted autoplay is blocked, and unmutes on a gesture', async () => {
    const { engine, player, state, settle, clock } = setup();
    player.blockUnmutedAutoplay = true;
    await engine.apply(state());
    await settle();
    clock.advance(autoplayDetectMs);
    await engine.tick();
    expect(player.muted).toBe(true);
    expect(player.state).toBe('playing');
    expect(engine.status).toBe('muted');
    await engine.tick();
    expect(engine.status).toBe('muted');

    player.blockUnmutedAutoplay = false;
    await engine.userGesture();
    expect(player.muted).toBe(false);
    expect(engine.status).toBe('in_sync');
  });

  it('asks for a click when even muted playback is blocked', async () => {
    const { engine, player, state, settle, clock } = setup();
    player.blockAllAutoplay = true;
    await engine.apply(state());
    await settle();
    clock.advance(autoplayDetectMs);
    await engine.tick();
    clock.advance(autoplayDetectMs);
    await engine.tick();
    expect(engine.status).toBe('blocked');
    const calls = player.calls.length;
    await engine.tick();
    expect(player.calls).toHaveLength(calls);

    player.blockAllAutoplay = false;
    await engine.userGesture();
    expect(player.state).toBe('playing');
    expect(engine.status).toBe('in_sync');
  });

  describe('viewer mute (setMuted)', () => {
    /** Unmuted autoplay blocked → engine falls back to muted playback. */
    const forcedMuted = async () => {
      const t = setup();
      t.player.blockUnmutedAutoplay = true;
      await t.engine.apply(t.state());
      await t.settle();
      t.clock.advance(autoplayDetectMs);
      await t.engine.tick();
      expect(t.engine.status).toBe('muted');
      return t;
    };

    it('muting during the autoplay fallback makes it the viewer’s choice (no "tap to unmute")', async () => {
      const { engine, player, settle } = await forcedMuted();
      await engine.setMuted(true);
      expect(player.muted).toBe(true);
      expect(player.state).toBe('playing');
      expect(engine.status).toBe('in_sync');
      await settle();
      await settle();
      expect(engine.status).toBe('in_sync');
    });

    it('unmuting during the autoplay fallback unmutes and keeps playing', async () => {
      const { engine, player } = await forcedMuted();
      player.blockUnmutedAutoplay = false;
      await engine.setMuted(false);
      expect(player.muted).toBe(false);
      expect(player.state).toBe('playing');
      expect(engine.status).toBe('in_sync');
    });

    it('a viewer muted from the start plays muted without any fallback or banner', async () => {
      const { engine, player, state, settle } = setup();
      player.blockUnmutedAutoplay = true;
      await engine.setMuted(true);
      await engine.apply(state());
      await settle();
      expect(player.state).toBe('playing');
      expect(engine.status).toBe('in_sync');
      expect(player.calls).not.toContain('unmute');
    });

    it('a muted viewer whose browser blocks even muted playback gets the click gate, never unmuted', async () => {
      const { engine, player, state, settle, clock } = setup();
      player.blockAllAutoplay = true;
      await engine.setMuted(true);
      await engine.apply(state());
      await settle();
      clock.advance(autoplayDetectMs);
      await engine.tick();
      expect(engine.status).toBe('blocked');
      expect(player.calls).not.toContain('unmute');
    });

    it('clicking through the gate while muted starts playback and keeps the viewer muted', async () => {
      const { engine, player, state, settle, clock } = setup();
      player.blockAllAutoplay = true;
      await engine.setMuted(true);
      await engine.apply(state());
      await settle();
      clock.advance(autoplayDetectMs);
      await engine.tick();
      expect(engine.status).toBe('blocked');

      player.blockAllAutoplay = false;
      await engine.setMuted(true);
      expect(player.state).toBe('playing');
      expect(player.muted).toBe(true);
      expect(engine.status).toBe('in_sync');
      expect(player.calls).not.toContain('unmute');
    });

    it('does not start playback when the room is paused', async () => {
      const { engine, player, state, settle } = setup();
      await engine.apply(state({ playState: 'paused' }));
      await settle();
      await engine.setMuted(false);
      await engine.setMuted(true);
      expect(player.calls).not.toContain('play');
      expect(engine.status).toBe('in_sync');
    });

    it('works with no video loaded (stays idle, only mutes)', async () => {
      const { engine, player } = setup();
      await engine.setMuted(true);
      expect(player.calls).toEqual(['mute']);
      expect(engine.status).toBe('idle');
    });

    it('never interleaves with a reconcile in progress', async () => {
      const { engine, player, state } = setup();
      const applied = engine.apply(state());
      const muted = engine.setMuted(true);
      await Promise.all([applied, muted]);
      expect(player.calls[0]).toBe(`load:${VIDEO}@0.0:true`);
      expect(player.calls[1]).toBe('mute');
    });

    it('survives a failing mute and keeps syncing', async () => {
      const { engine, player, state, settle } = setup();
      await engine.apply(state());
      await settle();
      const original = player.setMuted.bind(player);
      player.setMuted = () => Promise.reject(new Error('player gone'));
      await expect(engine.setMuted(true)).resolves.toBeUndefined();
      player.setMuted = original;
      await settle();
      expect(player.state).toBe('playing');
    });

    it('a repeated toggle ends in the last requested state', async () => {
      const { engine, player, state, settle } = setup();
      await engine.apply(state());
      await settle();
      void engine.setMuted(true);
      void engine.setMuted(false);
      await engine.setMuted(true);
      expect(player.muted).toBe(true);
      expect(player.calls.filter((c) => c === 'mute' || c === 'unmute')).toEqual(['mute', 'unmute', 'mute']);
    });
  });

  it('reports the duration once per video when playback starts', async () => {
    const { engine, player, state, events } = setup();
    await engine.apply(state());
    player.emitState('playing');
    await Promise.resolve();
    expect(events.durations).toEqual([[VIDEO, 200]]);
  });

  it('reports the end once per revision, and only near the end', async () => {
    const { engine, player, state, clock, events } = setup();
    await engine.apply(state({ duration: 100, rev: 3 }));
    clock.advance(10_000);
    player.emitState('ended');
    expect(events.ended).toEqual([]);
    clock.advance(89_000);
    player.emitState('ended');
    player.emitState('ended');
    expect(events.ended).toEqual([[VIDEO, 3]]);
  });

  it('does not restart a video that ended', async () => {
    const { engine, player, state, settle } = setup();
    await engine.apply(state());
    await settle();
    player.emitState('ended');
    const calls = player.calls.length;
    await settle();
    expect(player.calls).toHaveLength(calls);
  });

  it('shows buffering and recovers', async () => {
    const { engine, player, state, settle } = setup();
    await engine.apply(state());
    await settle();
    player.emitState('buffering');
    expect(engine.status).toBe('buffering');
    player.emitState('playing');
    expect(engine.status).toBe('in_sync');
  });

  it('stops trying a video YouTube refuses to embed, until the room picks another', async () => {
    const { engine, player, state, settle } = setup();
    await engine.apply(state());
    player.emitError(150);
    expect(engine.status).toBe('embed_error');
    const calls = player.calls.length;
    await settle();
    expect(player.calls).toHaveLength(calls);
    player.emitError(5);
    expect(engine.status).toBe('embed_error');
    await engine.apply(state({ videoId: OTHER, rev: 2 }));
    expect(engine.status).toBe('loading');
  });

  it('tells apart why a video cannot play: private/removed, embedding off, player rejected', async () => {
    for (const [code, status] of [
      [100, 'video_unavailable'],
      [101, 'embed_error'],
      [153, 'player_rejected'],
    ] as const) {
      const { engine, player, state, settle } = setup();
      await engine.apply(state());
      player.emitError(code);
      expect(engine.status).toBe(status);
      const calls = player.calls.length;
      await settle();
      expect(player.calls).toHaveLength(calls);
    }
  });

  it('coalesces overlapping updates to the latest room state', async () => {
    const { engine, player, state } = setup();
    await Promise.all([
      engine.apply(state()),
      engine.tick(),
      engine.apply(state({ videoId: OTHER, rev: 2 })),
    ]);
    expect(player.calls.filter((c) => c.startsWith('load'))).toEqual([`load:${OTHER}@0.0:true`]);
  });

  it('keeps enforcing play during the post-seek cooldown', async () => {
    const { engine, player, state, settle } = setup();
    await engine.apply(state());
    await settle();
    player.drift(5);
    await engine.tick();
    await player.pause();
    await engine.tick();
    expect(player.state).toBe('playing');
  });

  it('survives a failed player call and reloads on the next pass', async () => {
    const { engine, player, state } = setup();
    player.failNextLoad = true;
    await expect(engine.apply(state())).resolves.toBeUndefined();
    await engine.tick();
    expect(player.calls.filter((c) => c.startsWith('load'))).toHaveLength(2);
    expect(player.videoId).toBe(VIDEO);
  });

  it.each([Number.NaN, undefined, Number.POSITIVE_INFINITY] as unknown[])(
    'treats an unreadable player time (%s) as not measurable, without seeking',
    async (reading) => {
      const { engine, player, state, settle, events } = setup();
      await engine.apply(state());
      await settle();
      const calls = player.calls.length;
      player.getCurrentTime = () => Promise.resolve(reading as number);
      await settle();
      expect(events.drifts.at(-1)).toBeNull();
      expect(events.drifts.some((d) => d !== null && Number.isNaN(d))).toBe(false);
      expect(player.calls.slice(calls).some((c) => c.startsWith('seek'))).toBe(false);
      expect(player.state).toBe('playing');
    },
  );

  it('still enforces pause while the time is unreadable', async () => {
    const { engine, player, state, settle } = setup();
    await engine.apply(state());
    await settle();
    player.getCurrentTime = () => Promise.resolve(Number.NaN);
    await engine.apply(state({ playState: 'paused', rev: 2 }));
    await settle();
    expect(player.state).toBe('paused');
  });

  it('stops listening to the player when disposed', () => {
    const { engine, player } = setup();
    expect(player.listenerCount()).toBe(2);
    engine.dispose();
    expect(player.listenerCount()).toBe(0);
  });
});
