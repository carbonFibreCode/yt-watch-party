import { fireEvent, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { playback } from '@/test/fixtures';
import { renderInRoom, roomHarness } from '@/test/roomHarness';
import { PlayerSurface } from './PlayerSurface';
import type { SyncStatus } from './SyncEngine';
import type { PlayerSync } from './usePlayerSync';

const sync = (status: SyncStatus, rateUnsupported = false): PlayerSync => ({
  status,
  unavailable: false,
  playerState: 'playing',
  duration: null,
  driftMs: null,
  rateUnsupported,
  resume: vi.fn(),
  volume: 100,
  muted: status === 'muted',
  setVolume: vi.fn(),
  setMuted: vi.fn(),
});

const renderSurface = (status: SyncStatus, immersive: boolean) => {
  const harness = roomHarness('host', { playback: playback() });
  return renderInRoom(
    <PlayerSurface containerRef={createRef()} sync={sync(status)} canControl immersive={immersive}>
      <div data-testid="overlay-bar" />
    </PlayerSurface>,
    harness,
  );
};

describe('PlayerSurface', () => {
  it('keeps 16:9 with rounded corners when docked', () => {
    renderSurface('in_sync', false);
    const player = screen.getByTestId('player');
    expect(player.className).toContain('aspect-video');
    expect(player.className).toContain('border-2');
    expect(player.className).not.toContain('flex-1');
  });

  it('fills the available space in fullscreen, in any orientation', () => {
    renderSurface('in_sync', true);
    const player = screen.getByTestId('player');
    expect(player.className).toContain('flex-1');
    expect(player.className).toContain('min-h-0');
    expect(player.className).not.toContain('aspect-video');
  });

  it('draws its children (the fullscreen control bar) on top of every layer', () => {
    renderSurface('blocked', true);
    const player = screen.getByTestId('player');
    expect(player.lastElementChild).toBe(screen.getByTestId('overlay-bar'));
  });

  it('moves "Tap to unmute" to the top in fullscreen so the control bar does not cover it', () => {
    const { unmount } = renderSurface('muted', false);
    expect(screen.getByRole('button', { name: /Tap to unmute/ }).className).toContain('bottom-3');
    unmount();
    renderSurface('muted', true);
    const button = screen.getByRole('button', { name: /Tap to unmute/ });
    expect(button.className).toContain('top-12');
    expect(button.className).not.toContain('bottom-3');
  });
});

describe('PlayerSurface speed badge', () => {
  const renderWith = (rateUnsupported: boolean, playbackRate = 1.5, hasVideo = true) =>
    renderInRoom(
      <PlayerSurface containerRef={createRef()} sync={sync('in_sync', rateUnsupported)} canControl />,
      roomHarness('host', {
        playback: hasVideo
          ? playback({ playbackRate })
          : playback({ videoId: null, video: null, playState: 'idle', playbackRate }),
      }),
    );

  it('tells this viewer when their player cannot play at the room speed', () => {
    renderWith(true, 1.5);
    expect(screen.getByRole('status')).toHaveTextContent("This video can't play at 1.5× on your device");
  });

  it('shows nothing while the speed works', () => {
    renderWith(false);
    expect(screen.queryByText(/can't play at/)).toBeNull();
  });

  it('shows nothing without a video', () => {
    renderWith(true, 1.5, false);
    expect(screen.queryByText(/can't play at/)).toBeNull();
  });
});

describe('PlayerSurface gestures', () => {
  const renderGestures = ({ canSeek = true, hasVideo = true } = {}) => {
    const onSeekBy = vi.fn();
    const onToggleImmersive = vi.fn();
    const harness = roomHarness('host', {
      playback: hasVideo ? playback() : playback({ videoId: null, video: null, playState: 'idle' }),
    });
    renderInRoom(
      <PlayerSurface
        containerRef={createRef()}
        sync={sync('in_sync')}
        canControl={canSeek}
        canSeek={canSeek}
        onSeekBy={onSeekBy}
        onToggleImmersive={onToggleImmersive}
      />,
      harness,
    );
    const layer = screen.getByTestId('gesture-layer');
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200 }) as DOMRect;
    const doubleTap = (x: number): void => {
      fireEvent.doubleClick(layer, { clientX: x, clientY: 100 });
    };
    return { onSeekBy, onToggleImmersive, doubleTap, layer };
  };

  it.each([
    [10, -10],
    [99, -10],
    [201, 10],
    [299, 10],
  ])('double-tap at x=%s jumps %s s and shows it', (x, delta) => {
    const { onSeekBy, onToggleImmersive, doubleTap } = renderGestures();
    doubleTap(x);
    expect(onSeekBy).toHaveBeenCalledWith(delta);
    expect(onToggleImmersive).not.toHaveBeenCalled();
    expect(screen.getByTestId('seek-feedback')).toHaveTextContent(delta < 0 ? '−10 s' : '+10 s');
  });

  it.each([100, 150, 200])('double-tap in the middle third (x=%s) toggles fullscreen', (x) => {
    const { onSeekBy, onToggleImmersive, doubleTap } = renderGestures();
    doubleTap(x);
    expect(onToggleImmersive).toHaveBeenCalledTimes(1);
    expect(onSeekBy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('seek-feedback')).toBeNull();
  });

  it('participants and viewers cannot seek by gesture, but the middle still toggles fullscreen', () => {
    const { onSeekBy, onToggleImmersive, doubleTap } = renderGestures({ canSeek: false });
    doubleTap(10);
    doubleTap(290);
    expect(onSeekBy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('seek-feedback')).toBeNull();
    doubleTap(150);
    expect(onToggleImmersive).toHaveBeenCalledTimes(1);
  });

  it('no seeking without a video', () => {
    const { onSeekBy, doubleTap } = renderGestures({ hasVideo: false });
    doubleTap(10);
    expect(onSeekBy).not.toHaveBeenCalled();
  });

  it('a single click does nothing (one stray click must not change playback for everyone)', () => {
    const { onSeekBy, onToggleImmersive, layer } = renderGestures();
    fireEvent.click(layer, { clientX: 10 });
    fireEvent.click(layer, { clientX: 150 });
    expect(onSeekBy).not.toHaveBeenCalled();
    expect(onToggleImmersive).not.toHaveBeenCalled();
  });

  it('repeated taps each register (they add up through the shared seek)', () => {
    const { onSeekBy, doubleTap } = renderGestures();
    doubleTap(10);
    doubleTap(10);
    doubleTap(290);
    expect(onSeekBy.mock.calls).toEqual([[-10], [-10], [10]]);
    expect(screen.getAllByTestId('seek-feedback')).toHaveLength(1);
    expect(screen.getByTestId('seek-feedback')).toHaveTextContent('+10 s');
  });

  it('ignores a layer with no size (not laid out yet)', () => {
    const { onSeekBy, onToggleImmersive, layer } = renderGestures();
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect;
    fireEvent.doubleClick(layer, { clientX: 0 });
    expect(onSeekBy).not.toHaveBeenCalled();
    expect(onToggleImmersive).not.toHaveBeenCalled();
  });

  it('the gesture layer allows fast double-taps on touch (no double-tap zoom) and is hidden from AT', () => {
    const { layer } = renderGestures();
    expect(layer.className).toContain('touch-manipulation');
    expect(layer).toHaveAttribute('aria-hidden', 'true');
  });
});
