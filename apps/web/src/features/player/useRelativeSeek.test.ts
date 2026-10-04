import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEEK_COALESCE_MS } from '@watchparty/shared';
import type { RequestableAction } from '@watchparty/shared';
import { useRelativeSeek } from './useRelativeSeek';

type Props = Parameters<typeof useRelativeSeek>[0];

let now = 5_000_000;
beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const setup = (overrides: Partial<Props> = {}) => {
  const sent: RequestableAction[] = [];
  const props: Props = {
    send: (a) => {
      sent.push(a);
      return Promise.resolve(true);
    },
    position: () => 60,
    rev: 7,
    duration: 120,
    ...overrides,
  };
  const hook = renderHook((p: Props) => useRelativeSeek(p), { initialProps: props });
  const times = (): (number | null)[] => sent.map((a) => (a.type === 'seek' ? a.time : null));
  return { hook, props, times };
};

describe('useRelativeSeek', () => {
  it('keeps the same functions across renders (safe as effect/hotkey dependencies)', () => {
    const { hook, props } = setup();
    const first = hook.result.current;
    hook.rerender({ ...props, rev: 8, position: () => 1 });
    expect(hook.result.current.seekTo).toBe(first.seekTo);
    expect(hook.result.current.seekBy).toBe(first.seekBy);
  });

  it('reads the latest position, revision and length after a re-render', () => {
    const { hook, props, times } = setup();
    hook.rerender({ ...props, position: () => 30, duration: 35 });
    hook.result.current.seekBy(10);
    expect(times()).toEqual([35]);
  });

  it('absolute seeks clamp to the video and count as pending for the next relative one', () => {
    const { hook, times } = setup();
    hook.result.current.seekTo(500);
    hook.result.current.seekBy(-10);
    hook.result.current.seekTo(-5);
    hook.result.current.seekBy(3);
    expect(times()).toEqual([120, 110, 0, 3]);
  });

  it('has no upper bound while the length is unknown', () => {
    const { hook, times } = setup({ duration: null });
    hook.result.current.seekBy(1_000);
    expect(times()).toEqual([1_060]);
  });

  it('without a known revision, relies on the time window only', () => {
    const { hook, props, times } = setup({ rev: null });
    hook.result.current.seekBy(5);
    hook.rerender({ ...props, rev: null, position: () => 0 });
    hook.result.current.seekBy(5);
    now += SEEK_COALESCE_MS;
    hook.result.current.seekBy(5);
    expect(times()).toEqual([65, 70, 5]);
  });

  it('another action changing the revision ends coalescing early (accepted: it only resyncs)', () => {
    const { hook, props, times } = setup();
    hook.result.current.seekBy(10);
    hook.rerender({ ...props, rev: 8, position: () => 70 });
    hook.result.current.seekBy(10);
    expect(times()).toEqual([70, 80]);
  });
});
