import { create } from 'timesync';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimesyncClock } from './TimesyncClock';

describe('TimesyncClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses local time until synchronized', () => {
    vi.useFakeTimers({ now: 5_000 });
    expect(new TimesyncClock(() => Promise.reject(new Error('offline'))).now()).toBe(5_000);
  });

  it('estimates the server offset through the transport', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const SERVER_AHEAD_MS = 2_500;
    const requests: unknown[] = [];
    const clock = new TimesyncClock((request) => {
      requests.push(request);
      return Promise.resolve({ jsonrpc: '2.0', id: request.id, result: Date.now() + SERVER_AHEAD_MS });
    });
    clock.start();
    clock.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(requests.length).toBeGreaterThanOrEqual(1);
    expect(requests[0]).toMatchObject({ jsonrpc: '2.0', method: 'timesync' });
    expect(clock.now() - Date.now()).toBeCloseTo(SERVER_AHEAD_MS, -1);
    clock.stop();
    expect(clock.now()).toBe(Date.now());
  });

  it('keeps working (on local time) when every sample fails', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const factory = vi.fn(create);
    const clock = new TimesyncClock(() => Promise.reject(new Error('down')), factory);
    clock.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(clock.now()).toBe(Date.now());
    expect(factory).toHaveBeenCalledOnce();
    clock.stop();
  });
});
