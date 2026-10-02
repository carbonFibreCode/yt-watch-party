import type { AckResult, ClientEventName, ClientPayload } from '@watchparty/shared';
import { RateLimiterFlexibleAdapter } from '../../infrastructure/ratelimit/RateLimiterFlexibleAdapter';
import { InMemoryChatRepository } from '../../infrastructure/repositories/InMemoryChatRepository';
import { InMemoryMembershipRepository } from '../../infrastructure/repositories/InMemoryMembershipRepository';
import { InMemoryRoomRepository } from '../../infrastructure/repositories/InMemoryRoomRepository';
import { ChatService } from '../ChatService';
import { CommandPipeline } from '../commands/CommandPipeline';
import { CommandRegistry } from '../commands/CommandRegistry';
import { registerAllHandlers } from '../commands/registerAllHandlers';
import { MembershipService } from '../MembershipService';
import type { AuthUser } from '../ports';
import { RequestedActions } from '../RequestedActions';
import { RoomService } from '../RoomService';
import { VideoResolver } from '../VideoResolver';
import {
  authUser,
  FakeClock,
  FakePresenceProbe,
  FakeSession,
  RecordingBroadcaster,
  RecordingLogger,
  RecordingMetrics,
  SeqIdGenerator,
  StubVideoMetadataProvider,
} from './fakes';

export const VIDEO_URL = 'https://youtu.be/dQw4w9WgXcQ';
export const VIDEO_ID = 'dQw4w9WgXcQ';

/** The application wired exactly as main.ts wires it, with in-memory adapters and fakes. */
export const buildHarness = () => {
  const clock = new FakeClock();
  const ids = new SeqIdGenerator();
  const roomRepository = new InMemoryRoomRepository();
  const chatRepository = new InMemoryChatRepository();
  const memberships = new InMemoryMembershipRepository();
  const metadata = new StubVideoMetadataProvider();
  const broadcaster = new RecordingBroadcaster();
  const presence = new FakePresenceProbe();
  const logger = new RecordingLogger();
  const limiter = new RateLimiterFlexibleAdapter();

  const metrics = new RecordingMetrics();
  const rooms = new RoomService(roomRepository, clock, ids, metrics);
  const chat = new ChatService(chatRepository, broadcaster, ids, clock);
  const membership = new MembershipService(rooms, memberships, chat, broadcaster, presence, clock);
  const actions = new RequestedActions(new VideoResolver(metadata), ids);
  const pipeline = new CommandPipeline({ rooms, limiter, clock, logger, metrics });
  const registry = registerAllHandlers(new CommandRegistry(pipeline), {
    rooms,
    broadcaster,
    membership,
    chat,
    actions,
    ids,
    clock,
  });

  const send = <E extends ClientEventName>(
    session: FakeSession,
    event: E,
    payload: ClientPayload<E> | Record<string, unknown>,
  ): Promise<AckResult<unknown>> => registry.dispatch(event, payload, session);

  /** Creates a room hosted by `host` and joins the given users in order; returns their sessions. */
  const roomWith = async (host: AuthUser, ...others: AuthUser[]) => {
    const room = await rooms.create('Movie night', host);
    const hostSession = new FakeSession(host);
    await membership.join(hostSession, room.id);
    const sessions = [hostSession];
    for (const user of others) {
      const session = new FakeSession(user);
      await membership.join(session, room.id);
      sessions.push(session);
    }
    broadcaster.clear();
    return { roomId: room.id, sessions };
  };

  return {
    clock,
    ids,
    roomRepository,
    chatRepository,
    memberships,
    metadata,
    broadcaster,
    presence,
    logger,
    metrics,
    rooms,
    chat,
    membership,
    actions,
    pipeline,
    registry,
    send,
    roomWith,
    session: (userId: string, name?: string) => new FakeSession(authUser(userId, name)),
  };
};

export type Harness = ReturnType<typeof buildHarness>;
