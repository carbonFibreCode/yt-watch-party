import { ACK_TIMEOUT_MS, ackError } from '@watchparty/shared';
import type {
  AckData,
  AckError,
  AckResult,
  ClientEventName,
  ClientPayload,
  ErrorCode,
} from '@watchparty/shared';
import type { RoomSocket } from './socket';

/** A command the server refused (or that timed out); the user has already been notified. */
export class RpcError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'RpcError';
  }
}

type Emitters = {
  [E in ClientEventName]: (payload: ClientPayload<E>) => Promise<AckResult<AckData[E]>>;
};

/**
 * One typed emitter per contract event. Spelled out because Socket.IO's typings cannot express a
 * generic "emit E with its payload"; the mapped type makes the compiler demand every event.
 */
const createEmitters = (socket: RoomSocket): Emitters => {
  const s = () => socket.timeout(ACK_TIMEOUT_MS);
  return {
    join_room: (p) => s().emitWithAck('join_room', p),
    leave_room: (p) => s().emitWithAck('leave_room', p),
    play: (p) => s().emitWithAck('play', p),
    pause: (p) => s().emitWithAck('pause', p),
    seek: (p) => s().emitWithAck('seek', p),
    change_video: (p) => s().emitWithAck('change_video', p),
    assign_role: (p) => s().emitWithAck('assign_role', p),
    remove_participant: (p) => s().emitWithAck('remove_participant', p),
    transfer_host: (p) => s().emitWithAck('transfer_host', p),
    queue_add: (p) => s().emitWithAck('queue_add', p),
    queue_remove: (p) => s().emitWithAck('queue_remove', p),
    request_action: (p) => s().emitWithAck('request_action', p),
    resolve_request: (p) => s().emitWithAck('resolve_request', p),
    chat_message: (p) => s().emitWithAck('chat_message', p),
    reaction: (p) => s().emitWithAck('reaction', p),
    report_duration: (p) => s().emitWithAck('report_duration', p),
    video_ended: (p) => s().emitWithAck('video_ended', p),
    timesync: (p) => s().emitWithAck('timesync', p),
  };
};

export type Rpc = <E extends ClientEventName>(event: E, payload: ClientPayload<E>) => Promise<AckData[E]>;

export interface RpcOptions {
  /** Called for every refusal before the RpcError is thrown (the single place errors become toasts). */
  readonly onError: (error: AckError) => void;
}

/** The only way the client sends commands (rules.md §2.5): acked, timed out, errors surfaced once. */
export const createRpc = (socket: RoomSocket, options: RpcOptions): Rpc => {
  const emit = createEmitters(socket);
  return async (event, payload) => {
    const result = await emit[event](payload).catch(() => ackError<AckData[typeof event]>('TIMEOUT'));
    if (!result.ok) {
      options.onError(result.error);
      throw new RpcError(result.error.code);
    }
    return result.data;
  };
};
