import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { ClientEventName, ServerEventName } from '@watchparty/shared';
import { CAS_MAX_RETRIES } from '@watchparty/shared';
import type { CommandOutcome, Metrics } from '../../application/ports';

const MS_PER_SECOND = 1000;
const DURATION_BUCKETS_S = [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];
const CAS_BUCKETS = [1, 2, 3, 5, 10, CAS_MAX_RETRIES];

/** Values read at scrape time from the live server (this instance only). */
export interface LiveGauges {
  sockets(): number;
  rooms(): number;
}

/**
 * The Metrics port on prom-client (LLD SP-20), with a registry per instance (no global state, so
 * several servers can run in one test process) plus Node's default process metrics.
 */
export class PrometheusMetrics implements Metrics {
  readonly registry = new Registry();
  private readonly commands: Counter<'event' | 'outcome'>;
  private readonly commandDuration: Histogram<'event'>;
  private readonly casAttempts: Histogram;
  private readonly broadcasts: Counter<'event'>;

  constructor() {
    const registers = [this.registry];
    collectDefaultMetrics({ register: this.registry });
    this.commands = new Counter({
      name: 'wp_commands_total',
      help: 'Client commands handled, by event and outcome (ok | rejected | failed).',
      labelNames: ['event', 'outcome'],
      registers,
    });
    this.commandDuration = new Histogram({
      name: 'wp_command_duration_seconds',
      help: 'Time from receiving a command to acknowledging it.',
      labelNames: ['event'],
      buckets: DURATION_BUCKETS_S,
      registers,
    });
    this.casAttempts = new Histogram({
      name: 'wp_cas_attempts',
      help: 'Compare-and-set attempts per committed room mutation (1 = no contention).',
      buckets: CAS_BUCKETS,
      registers,
    });
    this.broadcasts = new Counter({
      name: 'wp_broadcast_events_total',
      help: 'Events emitted to clients, by event name.',
      labelNames: ['event'],
      registers,
    });
  }

  /** Registers the gauges that read live state; called once the Socket.IO server exists. */
  trackLive(live: LiveGauges): void {
    const registers = [this.registry];
    new Gauge({
      name: 'wp_sockets_connected',
      help: 'Sockets connected to this instance.',
      registers,
      collect() {
        this.set(live.sockets());
      },
    });
    new Gauge({
      name: 'wp_rooms_active',
      help: 'Rooms with at least one socket on this instance.',
      registers,
      collect() {
        this.set(live.rooms());
      },
    });
  }

  commandHandled(event: ClientEventName, outcome: CommandOutcome, durationMs: number): void {
    this.commands.inc({ event, outcome });
    this.commandDuration.observe({ event }, durationMs / MS_PER_SECOND);
  }

  roomCommitted(attempts: number): void {
    this.casAttempts.observe(attempts);
  }

  eventBroadcast(event: ServerEventName): void {
    this.broadcasts.inc({ event });
  }
}
