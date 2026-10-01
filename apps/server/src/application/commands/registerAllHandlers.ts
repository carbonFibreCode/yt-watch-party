import type { ChatService } from '../ChatService';
import type { MembershipService } from '../MembershipService';
import type { Broadcaster, Clock, IdGenerator } from '../ports';
import type { RequestedActions } from '../RequestedActions';
import type { RoomService } from '../RoomService';
import type { CommandRegistry } from './CommandRegistry';
import { AssignRole } from './handlers/AssignRole';
import { ChangeVideo } from './handlers/ChangeVideo';
import { ChatMessage } from './handlers/ChatMessage';
import { JoinRoom } from './handlers/JoinRoom';
import { LeaveRoom } from './handlers/LeaveRoom';
import { Pause } from './handlers/Pause';
import { Play } from './handlers/Play';
import { QueueAdd } from './handlers/QueueAdd';
import { QueueRemove } from './handlers/QueueRemove';
import { Reaction } from './handlers/Reaction';
import { RemoveParticipant } from './handlers/RemoveParticipant';
import { ReportDuration } from './handlers/ReportDuration';
import { RequestAction } from './handlers/RequestAction';
import { ResolveRequest } from './handlers/ResolveRequest';
import { Seek } from './handlers/Seek';
import { Timesync } from './handlers/Timesync';
import { TransferHost } from './handlers/TransferHost';
import { VideoEnded } from './handlers/VideoEnded';

export interface HandlerDeps {
  readonly rooms: RoomService;
  readonly broadcaster: Broadcaster;
  readonly membership: MembershipService;
  readonly chat: ChatService;
  readonly actions: RequestedActions;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** The complete handler list, shared by the composition root and the test harness. */
export const registerAllHandlers = (registry: CommandRegistry, deps: HandlerDeps): CommandRegistry => {
  const room = { rooms: deps.rooms, broadcaster: deps.broadcaster };
  return registry
    .register(new JoinRoom(deps.membership))
    .register(new LeaveRoom(deps.membership))
    .register(new Play(room, deps.actions))
    .register(new Pause(room, deps.actions))
    .register(new Seek(room, deps.actions))
    .register(new ChangeVideo(room, deps.actions))
    .register(new QueueAdd(room, deps.actions))
    .register(new QueueRemove(room))
    .register(new AssignRole(room))
    .register(new RemoveParticipant(room))
    .register(new TransferHost(room))
    .register(new RequestAction(room, deps.actions, deps.ids))
    .register(new ResolveRequest(room, deps.actions))
    .register(new ReportDuration(room))
    .register(new VideoEnded(room))
    .register(new ChatMessage(deps.chat))
    .register(new Reaction(deps.broadcaster, deps.ids, deps.clock))
    .register(new Timesync(deps.clock));
};
