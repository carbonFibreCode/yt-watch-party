import { ClientEventSchemas } from '@watchparty/shared';
import type { ClientPayload, TimesyncAck } from '@watchparty/shared';
import type { Clock } from '../../ports';
import type { CommandHandler } from '../CommandHandler';

/** Server half of the `timesync` JSON-RPC exchange (LLD SP-12). */
export class Timesync implements CommandHandler<'timesync'> {
  readonly event = 'timesync';
  readonly schema = ClientEventSchemas.timesync;
  readonly capability = null;
  readonly requiresMembership = false;
  readonly rateRule = 'telemetry';

  constructor(private readonly clock: Clock) {}

  handle(payload: ClientPayload<'timesync'>): Promise<TimesyncAck> {
    return Promise.resolve({ jsonrpc: '2.0', id: payload.id, result: this.clock.now() });
  }
}
