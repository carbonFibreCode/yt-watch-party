import { describe, expect, it } from 'vitest';
import { CHAT_MAX_LEN, ROOM_CODE_LENGTH } from '../constants';
import { CLIENT_EVENT_NAMES, ClientEventSchemas, RequestableAction } from './client-events';
import { CreateRoomBody } from './http';
import { AssignableRole, RoomCode } from './primitives';

const URL_INPUT = 'https://youtu.be/dQw4w9WgXcQ';

describe('RoomCode', () => {
  it('accepts a valid code', () => {
    expect(RoomCode.parse('K7M2QX')).toBe('K7M2QX');
  });

  it('normalizes case and whitespace', () => {
    expect(RoomCode.parse(' k7m2qx ')).toBe('K7M2QX');
  });

  it.each([
    ['ambiguous characters', 'K7M0OX'],
    ['wrong length', 'K7M2Q'],
    ['symbols', 'K7M-QX'],
  ])('rejects %s', (_label, code) => {
    expect(RoomCode.safeParse(code).success).toBe(false);
  });

  it('matches the configured length', () => {
    expect(RoomCode.parse('A'.repeat(ROOM_CODE_LENGTH))).toHaveLength(ROOM_CODE_LENGTH);
  });
});

describe('AssignableRole', () => {
  it.each(['moderator', 'participant', 'viewer'])('accepts %s', (role) => {
    expect(AssignableRole.safeParse(role).success).toBe(true);
  });

  it('rejects host, which only changes hands via transfer_host', () => {
    expect(AssignableRole.safeParse('host').success).toBe(false);
  });
});

describe('RequestableAction', () => {
  it.each([
    { type: 'play' },
    { type: 'pause' },
    { type: 'seek', time: 30 },
    { type: 'change_video', url: URL_INPUT },
    { type: 'queue_add', url: URL_INPUT },
  ])('accepts $type', (action) => {
    expect(RequestableAction.safeParse(action).success).toBe(true);
  });

  it.each([
    ['moderation actions', { type: 'assign_role', userId: 'u1', role: 'moderator' }],
    ['seek without a time', { type: 'seek' }],
    ['unknown extra fields', { type: 'play', force: true }],
  ])('rejects %s', (_label, action) => {
    expect(RequestableAction.safeParse(action).success).toBe(false);
  });

  it('reuses the payload shape of the corresponding command', () => {
    expect(RequestableAction.safeParse({ type: 'seek', time: -1 }).success).toBe(
      ClientEventSchemas.seek.safeParse({ time: -1 }).success,
    );
  });
});

describe('ClientEventSchemas', () => {
  it('includes every event name mandated by the brief', () => {
    expect(CLIENT_EVENT_NAMES).toEqual(
      expect.arrayContaining([
        'join_room',
        'leave_room',
        'play',
        'pause',
        'seek',
        'change_video',
        'assign_role',
        'remove_participant',
      ]),
    );
  });

  it('rejects unknown keys on command payloads', () => {
    expect(ClientEventSchemas.play.safeParse({ userId: 'spoofed' }).success).toBe(false);
  });

  it('trims chat text and enforces the length limit', () => {
    expect(ClientEventSchemas.chat_message.parse({ text: '  hi  ' }).text).toBe('hi');
    expect(ClientEventSchemas.chat_message.safeParse({ text: '   ' }).success).toBe(false);
    expect(ClientEventSchemas.chat_message.safeParse({ text: 'x'.repeat(CHAT_MAX_LEN + 1) }).success).toBe(
      false,
    );
  });

  it('only accepts reactions from the fixed set', () => {
    expect(ClientEventSchemas.reaction.safeParse({ emoji: '🔥', videoTime: 3 }).success).toBe(true);
    expect(ClientEventSchemas.reaction.safeParse({ emoji: '💩', videoTime: 3 }).success).toBe(false);
  });

  it('tolerates extra JSON-RPC fields on timesync', () => {
    expect(ClientEventSchemas.timesync.safeParse({ jsonrpc: '2.0', id: 1, method: 'timesync' }).success).toBe(
      true,
    );
  });

  it('rejects non-finite seek times', () => {
    expect(ClientEventSchemas.seek.safeParse({ time: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
});

describe('CreateRoomBody', () => {
  it('accepts an empty body', () => {
    expect(CreateRoomBody.safeParse({}).success).toBe(true);
  });

  it('trims the room name', () => {
    expect(CreateRoomBody.parse({ name: '  Movie night ' }).name).toBe('Movie night');
  });
});
