import { ClientEventSchemas, EMPTY_ACK } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import type { Broadcaster, Clock, IdGenerator } from '../../ports';
import { requireRoomId } from '../authorization';
import type { CommandContext, CommandHandler } from '../CommandHandler';
import { requireActor } from '../requireActor';

/** Side channel: ephemeral, never persisted (LLD SP-15). */
export class Reaction implements CommandHandler<'reaction'> {
  readonly event = 'reaction';
  readonly schema = ClientEventSchemas.reaction;
  readonly capability = 'reaction.send';
  readonly requiresMembership = true;
  readonly rateRule = 'reaction';

  constructor(
    private readonly broadcaster: Broadcaster,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  handle(payload: ClientPayload<'reaction'>, ctx: CommandContext): Promise<EmptyAck> {
    const actor = requireActor(ctx);
    this.broadcaster.toRoom(requireRoomId(ctx.session), 'reaction', {
      id: this.ids.next(),
      userId: actor.userId,
      name: actor.name,
      emoji: payload.emoji,
      videoTime: payload.videoTime,
      at: this.clock.now(),
    });
    return Promise.resolve(EMPTY_ACK);
  }
}
