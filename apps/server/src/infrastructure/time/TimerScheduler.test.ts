import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordingLogger } from '../../application/test/fakes';
import { TimerScheduler } from './TimerScheduler';

describe('TimerScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a task after its delay', async () => {
    const scheduler = new TimerScheduler(new RecordingLogger());
    const task = vi.fn(() => Promise.resolve());
    scheduler.schedule('k', 1_000, task);
    await vi.advanceTimersByTimeAsync(999);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledOnce();
    expect(scheduler.pending).toBe(0);
  });

  it('replaces the timer when a key is scheduled again', async () => {
    const scheduler = new TimerScheduler(new RecordingLogger());
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());
    scheduler.schedule('k', 1_000, first);
    scheduler.schedule('k', 1_000, second);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('cancels everything', async () => {
    const scheduler = new TimerScheduler(new RecordingLogger());
    const task = vi.fn(() => Promise.resolve());
    scheduler.schedule('a', 10, task);
    scheduler.schedule('b', 10, task);
    scheduler.cancelAll();
    await vi.advanceTimersByTimeAsync(10);
    expect(task).not.toHaveBeenCalled();
  });

  it('logs task failures instead of crashing the process', async () => {
    const logger = new RecordingLogger();
    new TimerScheduler(logger).schedule('k', 10, () => Promise.reject(new Error('boom')));
    await vi.advanceTimersByTimeAsync(10);
    expect(logger.entries).toMatchObject([{ level: 'error', fields: { key: 'k' } }]);
  });
});
