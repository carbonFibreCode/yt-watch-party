import { screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { playback } from '@/test/fixtures';
import { renderInRoom, roomHarness } from '@/test/roomHarness';
import { PlayerSurface } from './PlayerSurface';
import type { SyncStatus } from './SyncEngine';
import type { PlayerSync } from './usePlayerSync';

const sync = (status: SyncStatus): PlayerSync => ({
  status,
  unavailable: false,
  playerState: 'playing',
  duration: null,
  driftMs: null,
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
    expect(player.className).toContain('rounded-xl');
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
