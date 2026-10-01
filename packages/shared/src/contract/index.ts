import type { AckResult } from '../errors';
import type { AckData, ClientEventName, ClientPayload } from './client-events';

export * from './client-events';
export * from './http';
export * from './primitives';
export * from './server-events';
export * from './views';

/**
 * Socket.IO client → server event map, derived from the zod schemas so it can never drift
 * from runtime validation (LLD SP-1). Every command is acknowledged with an AckResult.
 */
export type ClientToServerEvents = {
  [E in ClientEventName]: (payload: ClientPayload<E>, ack: (result: AckResult<AckData[E]>) => void) => void;
};
