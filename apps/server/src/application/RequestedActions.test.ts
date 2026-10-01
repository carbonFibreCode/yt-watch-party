import { describe, expect, it } from 'vitest';
import { Room } from '../domain/Room';
import { RequestedActions } from './RequestedActions';
import { SeqIdGenerator, StubVideoMetadataProvider, T0 } from './test/fakes';
import { VideoResolver } from './VideoResolver';

const actions = () =>
  new RequestedActions(new VideoResolver(new StubVideoMetadataProvider()), new SeqIdGenerator());

const room = (): Room => {
  const r = Room.create({ id: 'K7M2QX', name: 'x', host: { userId: 'h', name: 'Hana' }, now: T0 });
  r.join({ userId: 'h', name: 'Hana' }, T0);
  return r;
};

describe('RequestedActions', () => {
  it('prepares actions without I/O', async () => {
    const a = actions();
    expect(await a.prepare({ type: 'play' })).toEqual({ type: 'play' });
    expect(await a.prepare({ type: 'pause' })).toEqual({ type: 'pause' });
    expect(await a.prepare({ type: 'seek', time: 9 })).toEqual({ type: 'seek', time: 9 });
  });

  it('resolves URLs for video actions', async () => {
    const a = actions();
    expect(await a.prepare({ type: 'change_video', url: 'https://youtu.be/dQw4w9WgXcQ?t=7' })).toMatchObject({
      type: 'change_video',
      video: { id: 'dQw4w9WgXcQ' },
      startAt: 7,
    });
    expect(await a.prepare({ type: 'queue_add', url: 'dQw4w9WgXcQ' })).toMatchObject({
      type: 'queue_add',
      video: { id: 'dQw4w9WgXcQ' },
    });
  });

  it('applies every action type to the room', async () => {
    const a = actions();
    const r = room();
    const host = r.participant('h')!;
    a.apply(r, await a.prepare({ type: 'change_video', url: 'dQw4w9WgXcQ' }), host, T0);
    a.apply(r, await a.prepare({ type: 'pause' }), host, T0 + 1_000);
    a.apply(r, await a.prepare({ type: 'seek', time: 30 }), host, T0 + 2_000);
    a.apply(r, await a.prepare({ type: 'play' }), host, T0 + 3_000);
    a.apply(r, await a.prepare({ type: 'queue_add', url: 'aaaaaaaaaaa' }), host, T0 + 4_000);
    expect(r.playback.playState).toBe('playing');
    expect(r.playback.positionAt(T0 + 3_000)).toBe(30);
    expect(r.queueItems()).toMatchObject([{ id: 'id-1', addedBy: { userId: 'h', name: 'Hana' } }]);
  });
});
