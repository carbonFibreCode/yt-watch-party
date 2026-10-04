import { describe, expect, it } from 'vitest';
import { Room } from '../../domain/Room';
import { RoomSnapshotCodec } from './RoomSnapshotCodec';

const room = (): Room => {
  const r = Room.create({ id: 'K7M2QX', name: 'Codec', host: { userId: 'u1', name: 'Hana' }, now: 1 });
  r.join({ userId: 'u1', name: 'Hana' }, 2);
  r.join({ userId: 'u2', name: 'Pat' }, 3);
  r.changeVideo({ id: 'dQw4w9WgXcQ', title: 'T', thumbnailUrl: 'x' }, 5, 4);
  r.enqueue(
    {
      id: 'q1',
      video: { id: 'aaaaaaaaaaa', title: 'Q', thumbnailUrl: 'y' },
      addedBy: { userId: 'u1', name: 'Hana' },
    },
    5,
  );
  r.createRequest(
    'u2',
    { type: 'change_video', video: { id: 'bbbbbbbbbbb', title: 'R', thumbnailUrl: 'z' }, startAt: 3 },
    'r1',
    6,
  );
  r.leave('u2');
  return r;
};

describe('RoomSnapshotCodec', () => {
  it('round-trips a full snapshot', () => {
    const snapshot = room().toSnapshot();
    expect(RoomSnapshotCodec.decode(RoomSnapshotCodec.encode(snapshot))).toEqual(snapshot);
  });

  it('parses already-decoded JSON values', () => {
    const snapshot = room().toSnapshot();
    expect(RoomSnapshotCodec.parse(JSON.parse(RoomSnapshotCodec.encode(snapshot)))).toEqual(snapshot);
  });

  it('round-trips a speed and a pending speed request', () => {
    const r = room();
    r.setRate(1.5, 7);
    r.join({ userId: 'u2', name: 'Pat' }, 8);
    r.createRequest('u2', { type: 'set_rate', rate: 0.5 }, 'r2', 9);
    const snapshot = r.toSnapshot();
    const decoded = RoomSnapshotCodec.decode(RoomSnapshotCodec.encode(snapshot));
    expect(decoded).toEqual(snapshot);
    expect(decoded.playback.rate).toBe(1.5);
    expect(decoded.requests.map((q) => q.action)).toContainEqual({ type: 'set_rate', rate: 0.5 });
  });

  it('loads a room saved before playback speed existed at normal speed', () => {
    const value = JSON.parse(RoomSnapshotCodec.encode(room().toSnapshot())) as {
      playback: Record<string, unknown>;
    };
    delete value.playback.rate;
    const decoded = RoomSnapshotCodec.parse(value);
    expect(decoded.playback.rate).toBe(1);
    expect(Room.fromSnapshot(decoded).playback.rate).toBe(1);
  });

  it.each([0, -1, 'fast', null])('rejects a stored speed of %s', (rate) => {
    const value = JSON.parse(RoomSnapshotCodec.encode(room().toSnapshot())) as {
      playback: Record<string, unknown>;
    };
    value.playback.rate = rate;
    expect(() => RoomSnapshotCodec.parse(value)).toThrow();
  });

  it('rejects corrupt data instead of loading a broken aggregate', () => {
    expect(() => RoomSnapshotCodec.decode('{"id":"K7M2QX"}')).toThrow();
    expect(() => RoomSnapshotCodec.decode('not json')).toThrow();
  });

  it('rejects an unknown requested action type', () => {
    const value = JSON.parse(RoomSnapshotCodec.encode(room().toSnapshot())) as { requests: unknown[] };
    value.requests = [
      {
        id: 'r',
        requester: { userId: 'u', name: 'n' },
        action: { type: 'nuke' },
        createdAt: 1,
        expiresAt: 2,
      },
    ];
    expect(() => RoomSnapshotCodec.parse(value)).toThrow();
  });
});
