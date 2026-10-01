import type { z } from 'zod';
import type { AckData, Capability, ClientEventName, ClientPayload, RateRule } from '@watchparty/shared';
import type { Participant } from '../../domain/Participant';
import type { Room } from '../../domain/Room';
import type { Broadcaster } from '../ports';
import type { RoomService } from '../RoomService';
import { authorizeIn, requireRoomId } from './authorization';
import type { CommandContext, CommandHandler } from './CommandHandler';

export interface RoomCommandDeps {
  readonly rooms: RoomService;
  readonly broadcaster: Broadcaster;
}

export interface ExecuteArgs<P> {
  readonly actor: Participant;
  readonly input: P;
  readonly now: number;
}

/**
 * Template Method for every command that mutates a room (LLD SP-7):
 * prepare (I/O, outside the lock) → mutate { re-authorize against fresh state → execute } → broadcast.
 * The re-check closes the race where the actor was demoted between dispatch and commit.
 */
export abstract class RoomCommand<E extends ClientEventName, P> implements CommandHandler<E> {
  abstract readonly event: E;
  abstract readonly schema: z.ZodType<ClientPayload<E>>;
  abstract readonly capability: Capability | null;
  abstract readonly rateRule: RateRule;
  readonly requiresMembership = true;

  constructor(protected readonly deps: RoomCommandDeps) {}

  async handle(payload: ClientPayload<E>, ctx: CommandContext): Promise<AckData[E]> {
    const roomId = requireRoomId(ctx.session);
    const input = await this.prepare(payload);
    const { result, room, events } = await this.deps.rooms.mutate(roomId, (r, now) => {
      const actor = authorizeIn(r, ctx.user.userId, this.capability);
      return this.execute(r, { actor, input, now });
    });
    await this.deps.broadcaster.publish(room, events);
    return result;
  }

  protected abstract prepare(payload: ClientPayload<E>): Promise<P>;

  /** Pure: may run more than once if a concurrent commit forces a CAS retry. */
  protected abstract execute(room: Room, args: ExecuteArgs<P>): AckData[E];
}

/** A room command whose input is its validated payload, with no I/O phase. */
export abstract class SimpleRoomCommand<E extends ClientEventName> extends RoomCommand<E, ClientPayload<E>> {
  protected prepare(payload: ClientPayload<E>): Promise<ClientPayload<E>> {
    return Promise.resolve(payload);
  }
}
