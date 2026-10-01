import type { Participant } from '../../../domain/Participant';
import type { RealtimeSession } from '../../ports';
import type { RoomService } from '../../RoomService';
import { requireMember, requireRoomId } from '../authorization';
import type { CommandPolicy } from '../CommandHandler';

/** Step 3: the socket must be attached to a room the user is still a member of. */
export const resolveMembership = async (
  rooms: RoomService,
  policy: CommandPolicy,
  session: RealtimeSession,
): Promise<Participant | null> => {
  if (!policy.requiresMembership) {
    return null;
  }
  const room = await rooms.read(requireRoomId(session));
  return requireMember(room, session.user.userId);
};
