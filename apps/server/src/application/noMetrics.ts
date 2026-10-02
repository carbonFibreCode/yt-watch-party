import type { Metrics } from './ports';

/** The Null Object for Metrics: the default wherever nobody scrapes (tests, tools). */
export const noMetrics: Metrics = {
  commandHandled: () => undefined,
  roomCommitted: () => undefined,
  eventBroadcast: () => undefined,
};
