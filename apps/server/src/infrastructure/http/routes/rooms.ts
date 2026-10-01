import { Router } from 'express';
import type { Request } from 'express';
import { CreateRoomBody, RECENT_ROOMS_LIMIT, RoomCode } from '@watchparty/shared';
import type { CreateRoomResponse, RoomPreview, RoomSummary } from '@watchparty/shared';
import type {
  AuthUser,
  MembershipRepository,
  RateLimiter,
  SessionResolver,
} from '../../../application/ports';
import type { RoomService } from '../../../application/RoomService';
import type { VideoResolver } from '../../../application/VideoResolver';
import { DomainError } from '../../../domain/DomainError';
import { parseInput } from '../validate';

export interface RoomsRouterDeps {
  readonly rooms: RoomService;
  readonly videos: VideoResolver;
  readonly memberships: MembershipRepository;
  readonly sessions: SessionResolver;
  readonly limiter: RateLimiter;
}

/** REST endpoints for creating, previewing and listing rooms (LLD SP-18). */
export const createRoomsRouter = (deps: RoomsRouterDeps): Router => {
  const router = Router();

  const requireUser = async (req: Request): Promise<AuthUser> => {
    const user = await deps.sessions.resolve(req.headers);
    if (user === null) {
      throw new DomainError('UNAUTHENTICATED');
    }
    return user;
  };

  router.post('/rooms', async (req, res) => {
    const user = await requireUser(req);
    await deps.limiter.consume('createRoom', user.userId);
    const body = parseInput(CreateRoomBody, req.body);
    const initial = body.videoUrl === undefined ? undefined : await deps.videos.resolve(body.videoUrl);
    const room = await deps.rooms.create(body.name ?? `${user.name}'s room`, user, initial);
    await deps.memberships.touch({
      roomId: room.id,
      userId: user.userId,
      roomName: room.name,
      role: 'host',
      at: room.createdAt,
    });
    const response: CreateRoomResponse = { roomId: room.id };
    res.status(201).json(response);
  });

  /** Public: lets the join screen show what you are joining before you pick a name. */
  router.get('/rooms/:code', async (req, res) => {
    const room = await deps.rooms.read(parseInput(RoomCode, req.params.code));
    const preview: RoomPreview = {
      roomId: room.id,
      name: room.name,
      hostName: room.participant(room.hostId)?.name ?? null,
      participantCount: room.participants().filter((p) => p.presence === 'online').length,
      video: room.playback.video,
    };
    res.json(preview);
  });

  router.get('/me/rooms', async (req, res) => {
    const user = await requireUser(req);
    const recent: readonly RoomSummary[] = await deps.memberships.recentForUser(
      user.userId,
      RECENT_ROOMS_LIMIT,
    );
    res.json(recent);
  });

  return router;
};
