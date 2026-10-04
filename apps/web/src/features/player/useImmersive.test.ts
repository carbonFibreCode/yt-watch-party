import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImmersive } from './useImmersive';

/** A controllable stand-in for screenfull (jsdom has no Fullscreen API). */
const fs = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    isEnabled: true,
    isFullscreen: false,
    /** Resolves the pending request; set per test. */
    resolveRequest: null as (() => void) | null,
    rejectRequest: null as ((e: Error) => void) | null,
    deferRequests: false,
    refuseRequests: false,
    request: vi.fn(),
    exit: vi.fn(),
    on: vi.fn((_event: string, fn: () => void) => listeners.add(fn)),
    off: vi.fn((_event: string, fn: () => void) => listeners.delete(fn)),
    listeners,
    /** The browser changed fullscreen state by itself. */
    browserSets(fullscreen: boolean) {
      state.isFullscreen = fullscreen;
      for (const fn of listeners) {
        fn();
      }
    },
  };
  return state;
});

vi.mock('screenfull', () => ({ default: fs }));

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  fs.isEnabled = true;
  fs.isFullscreen = false;
  fs.deferRequests = false;
  fs.refuseRequests = false;
  fs.listeners.clear();
  document.body.style.overflow = '';
  fs.request.mockReset().mockImplementation(() => {
    if (fs.refuseRequests) {
      return Promise.reject(new TypeError('Permissions check failed'));
    }
    if (fs.deferRequests) {
      return new Promise<void>((resolve, reject) => {
        fs.resolveRequest = () => {
          fs.browserSets(true);
          resolve();
        };
        fs.rejectRequest = reject;
      });
    }
    fs.browserSets(true);
    return Promise.resolve();
  });
  fs.exit.mockReset().mockImplementation(() => {
    fs.browserSets(false);
    return Promise.resolve();
  });
});

describe('useImmersive', () => {
  it('starts docked and reports native support', () => {
    const { result } = renderHook(() => useImmersive());
    expect(result.current.active).toBe(false);
    expect(result.current.native).toBe(true);
  });

  it('enters real fullscreen on the whole page and hides browser navigation UI', async () => {
    const { result } = renderHook(() => useImmersive());
    act(() => {
      result.current.toggle();
    });
    await flush();
    expect(result.current.active).toBe(true);
    expect(fs.request).toHaveBeenCalledWith(document.documentElement, { navigationUI: 'hide' });
  });

  it('exits fullscreen on the second toggle', async () => {
    const { result } = renderHook(() => useImmersive());
    act(() => {
      result.current.toggle();
    });
    await flush();
    act(() => {
      result.current.toggle();
    });
    await flush();
    expect(result.current.active).toBe(false);
    expect(fs.exit).toHaveBeenCalledTimes(1);
  });

  it('follows the browser when it leaves fullscreen by itself (Esc, system gesture)', async () => {
    const { result } = renderHook(() => useImmersive());
    act(() => {
      result.current.toggle();
    });
    await flush();
    act(() => {
      fs.browserSets(false);
    });
    expect(result.current.active).toBe(false);
    // The next toggle enters again (state was not left thinking it is still fullscreen).
    act(() => {
      result.current.toggle();
    });
    await flush();
    expect(result.current.active).toBe(true);
    expect(fs.request).toHaveBeenCalledTimes(2);
  });

  it('falls back to a viewport-filling player where fullscreen is unsupported (iPhone)', async () => {
    fs.isEnabled = false;
    const { result } = renderHook(() => useImmersive());
    expect(result.current.native).toBe(false);
    act(() => {
      result.current.toggle();
    });
    await flush();
    expect(result.current.active).toBe(true);
    expect(fs.request).not.toHaveBeenCalled();
    act(() => {
      result.current.exit();
    });
    expect(result.current.active).toBe(false);
    expect(fs.exit).not.toHaveBeenCalled();
    expect(fs.on).not.toHaveBeenCalled();
  });

  it('stays in the CSS fullscreen layer when the browser refuses the request', async () => {
    fs.refuseRequests = true;
    const { result } = renderHook(() => useImmersive());
    act(() => {
      result.current.toggle();
    });
    await flush();
    expect(result.current.active).toBe(true);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.active).toBe(false);
    expect(fs.exit).not.toHaveBeenCalled();
  });

  it('an exit before a slow fullscreen request finishes wins', async () => {
    fs.deferRequests = true;
    const { result } = renderHook(() => useImmersive());
    act(() => {
      result.current.toggle();
    });
    act(() => {
      result.current.toggle();
    });
    expect(result.current.active).toBe(false);
    expect(fs.exit).not.toHaveBeenCalled();
    act(() => {
      fs.resolveRequest?.();
    });
    await flush();
    expect(fs.exit).toHaveBeenCalledTimes(1);
    expect(fs.isFullscreen).toBe(false);
    expect(result.current.active).toBe(false);
  });

  it('does not request again while the page is already fullscreen', async () => {
    fs.isFullscreen = true;
    const { result } = renderHook(() => useImmersive());
    act(() => {
      result.current.toggle();
    });
    await flush();
    expect(result.current.active).toBe(true);
    expect(fs.request).not.toHaveBeenCalled();
  });

  it('locks page scrolling while active and restores the previous value', async () => {
    document.body.style.overflow = 'scroll';
    const { result } = renderHook(() => useImmersive());
    act(() => {
      result.current.toggle();
    });
    await flush();
    expect(document.body.style.overflow).toBe('hidden');
    act(() => {
      result.current.exit();
    });
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('never locks the orientation (the layout follows the device)', async () => {
    const lock = vi.fn(() => Promise.resolve());
    Object.defineProperty(screen, 'orientation', { configurable: true, value: { lock, unlock: vi.fn() } });
    const { result } = renderHook(() => useImmersive());
    act(() => {
      result.current.toggle();
    });
    await flush();
    expect(lock).not.toHaveBeenCalled();
  });

  it('leaving the room while fullscreen exits fullscreen, restores scrolling and stops listening', async () => {
    const { result, unmount } = renderHook(() => useImmersive());
    act(() => {
      result.current.toggle();
    });
    await flush();
    unmount();
    expect(fs.exit).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe('');
    expect(fs.listeners.size).toBe(0);
  });

  it('unmounting docked does not touch fullscreen someone else started', () => {
    fs.isFullscreen = true;
    const { unmount } = renderHook(() => useImmersive());
    unmount();
    expect(fs.exit).not.toHaveBeenCalled();
  });

  it('a rejected exit does not throw', async () => {
    const { result } = renderHook(() => useImmersive());
    act(() => {
      result.current.toggle();
    });
    await flush();
    fs.exit.mockImplementation(() => Promise.reject(new Error('not fullscreen')));
    act(() => {
      result.current.exit();
    });
    await flush();
    expect(result.current.active).toBe(false);
  });
});
