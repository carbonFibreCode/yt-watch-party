import { ClientEventSchemas, EMPTY_ACK } from '@watchparty/shared';
import type { ClientPayload, EmptyAck } from '@watchparty/shared';
import type { ChatService } from '../../ChatService';
import { requireRoomId } from '../authorization';
import type { CommandContext, CommandHandler } from '../CommandHandler';
import { requireActor } from '../requireActor';

/** Side channel: chat never touches the Room aggregate (LLD SP-15). */
export class ChatMessage implements CommandHandler<'chat_message'> {
  readonly event = 'chat_message';
  readonly schema = ClientEventSchemas.chat_message;
  readonly capability = 'chat.send';
  readonly requiresMembership = true;
  readonly rateRule = 'chat';

  constructor(private readonly chat: ChatService) {}

  async handle(payload: ClientPayload<'chat_message'>, ctx: CommandContext): Promise<EmptyAck> {
    await this.chat.post(requireRoomId(ctx.session), requireActor(ctx), payload.text);
    return EMPTY_ACK;
  }
}
