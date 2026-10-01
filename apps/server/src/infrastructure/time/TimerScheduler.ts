import type { Logger, Scheduler } from '../../application/ports';

/** setTimeout-backed Scheduler; timers never keep the process alive (`unref`). */
export class TimerScheduler implements Scheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly logger: Logger) {}

  schedule(key: string, delayMs: number, task: () => Promise<void>): void {
    clearTimeout(this.timers.get(key));
    const timer = setTimeout(() => {
      this.timers.delete(key);
      task().catch((error: unknown) => {
        this.logger.error({ err: error, key }, 'scheduled task failed');
      });
    }, delayMs);
    timer.unref();
    this.timers.set(key, timer);
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  get pending(): number {
    return this.timers.size;
  }
}
