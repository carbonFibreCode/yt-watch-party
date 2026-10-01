import { create } from 'timesync';
import type { TimeSync, TimeSyncRequest } from 'timesync';
import {
  CLOCK_SYNC_INTERVAL_MS,
  CLOCK_SYNC_SAMPLE_DELAY_MS,
  CLOCK_SYNC_SAMPLES,
  CLOCK_SYNC_TIMEOUT_MS,
} from '@watchparty/shared';
import type { TimesyncAck } from '@watchparty/shared';
import type { ServerClock } from './ports';

/** Sends one timesync request to the server and returns its reply (the `timesync` socket command). */
export type TimesyncTransport = (request: TimeSyncRequest) => Promise<TimesyncAck>;

/** The single-server id timesync passes to `send`; any non-empty value works. */
const SERVER_ID = 'watchparty';

/**
 * Server-epoch clock estimated with `timesync` (LLD SP-12): NTP-style samples over Socket.IO
 * acks, outliers discarded. Before the first sample (or if every sample fails) it falls back to
 * local time; a failed resync keeps the previous offset.
 */
export class TimesyncClock implements ServerClock {
  private sync: TimeSync | null = null;

  constructor(
    private readonly transport: TimesyncTransport,
    private readonly factory: typeof create = create,
  ) {}

  /** Starts syncing (idempotent): call once the socket is connected. */
  start(): void {
    if (this.sync !== null) {
      return;
    }
    const sync = this.factory({
      server: SERVER_ID,
      interval: CLOCK_SYNC_INTERVAL_MS,
      repeat: CLOCK_SYNC_SAMPLES,
      delay: CLOCK_SYNC_SAMPLE_DELAY_MS,
      timeout: CLOCK_SYNC_TIMEOUT_MS,
    });
    sync.send = async (_to, request) => {
      sync.receive(undefined, await this.transport(request));
    };
    // Failed samples are dropped by timesync itself; with a listener it also stays off the console.
    sync.on('error', () => undefined);
    this.sync = sync;
  }

  now(): number {
    return this.sync?.now() ?? Date.now();
  }

  stop(): void {
    this.sync?.destroy();
    this.sync = null;
  }
}
