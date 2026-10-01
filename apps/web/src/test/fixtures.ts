import type { JoinRoomAck, ParticipantView, PlaybackView } from '@watchparty/shared';

export const participant = (userId: string, overrides: Partial<ParticipantView> = {}): ParticipantView => ({
  userId,
  name: userId,
  role: 'participant',
  presence: 'online',
  joinedAt: 1,
  ...overrides,
});

export const playback = (overrides: Partial<PlaybackView> = {}): PlaybackView => ({
  videoId: 'dQw4w9WgXcQ',
  video: { id: 'dQw4w9WgXcQ', title: 'Video', thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg' },
  playState: 'playing',
  currentTime: 0,
  serverTime: 1_000,
  duration: null,
  rev: 1,
  ...overrides,
});

export const joinAck = (overrides: Partial<JoinRoomAck['room']> = {}): JoinRoomAck => ({
  room: {
    id: 'K7M2QX',
    name: 'Movie night',
    hostId: 'host',
    self: participant('me'),
    participants: [participant('host', { role: 'host', joinedAt: 0 }), participant('me')],
    playback: playback(),
    queue: [],
    pendingRequests: [],
    ...overrides,
  },
  chatHistory: [{ id: 'c1', user: { userId: 'host', name: 'host', role: 'host' }, text: 'hi', createdAt: 5 }],
});
