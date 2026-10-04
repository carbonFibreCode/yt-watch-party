import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { playback } from '@/test/fixtures';
import { renderInRoom, roomHarness } from '@/test/roomHarness';
import type { RequestView, Role } from '@watchparty/shared';
import { ControlBar } from './ControlBar';
import type { AudioControls } from './ControlBar';
import type { ControlMode } from './usePlaybackCommand';

const MODE: Record<Role, ControlMode> = {
  host: 'direct',
  moderator: 'direct',
  participant: 'request',
  viewer: 'none',
};

const request = (id: string): RequestView => ({
  id,
  requester: { userId: 'p1', name: 'Pat' },
  action: { type: 'seek', time: 30 },
  createdAt: 1,
  expiresAt: Date.now() + 60_000,
});

interface Setup {
  readonly role?: Role;
  readonly variant?: 'docked' | 'overlay';
  readonly duration?: number | null;
  readonly audio?: Partial<AudioControls>;
  readonly immersiveActive?: boolean;
  readonly theaterActive?: boolean;
  readonly requests?: readonly RequestView[];
  readonly playState?: 'playing' | 'paused';
}

const setup = ({
  role = 'host',
  variant = 'docked',
  duration = 200,
  audio = {},
  immersiveActive = false,
  theaterActive = false,
  requests = [],
  playState = 'playing',
}: Setup = {}) => {
  const harness = roomHarness(role, {
    playback: playback({ playState, currentTime: 50, serverTime: 1_000 }),
    pendingRequests: [...requests],
  });
  const send = vi.fn(() => Promise.resolve(true));
  const fullAudio: AudioControls = {
    muted: false,
    volume: 80,
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    ...audio,
  };
  const toggle = vi.fn();
  const toggleTheater = vi.fn();
  const onShowShortcuts = vi.fn();
  renderInRoom(
    <ControlBar
      command={{ mode: MODE[role], send }}
      duration={duration}
      audio={fullAudio}
      immersive={{ active: immersiveActive, toggle }}
      theater={{ active: theaterActive, toggle: toggleTheater }}
      onShowShortcuts={onShowShortcuts}
      variant={variant}
    />,
    harness,
  );
  return { send, audio: fullAudio, toggle, toggleTheater, onShowShortcuts, harness, user: userEvent.setup() };
};

const iconOf = (button: HTMLElement): string =>
  [...(button.querySelector('svg')?.classList ?? [])].find(
    (c) => c.startsWith('lucide-') && c !== 'lucide',
  ) ?? '';

describe('ControlBar: audio', () => {
  it.each([
    [{ muted: false, volume: 80 }, 'Mute', 'lucide-volume-2', 'false'],
    [{ muted: false, volume: 30 }, 'Mute', 'lucide-volume-1', 'false'],
    [{ muted: false, volume: 0 }, 'Mute', 'lucide-volume-x', 'false'],
    [{ muted: true, volume: 80 }, 'Unmute', 'lucide-volume-x', 'true'],
  ])('%o shows "%s" with %s', (audio, label, icon, pressed) => {
    setup({ audio });
    const button = screen.getByRole('button', { name: label });
    expect(iconOf(button)).toBe(icon);
    expect(button).toHaveAttribute('aria-pressed', pressed);
  });

  it('the mute button toggles mute', async () => {
    const { audio, user } = setup({ audio: { muted: false } });
    await user.click(screen.getByRole('button', { name: 'Mute' }));
    expect(audio.setMuted).toHaveBeenCalledWith(true);
  });

  it('the unmute button unmutes', async () => {
    const { audio, user } = setup({ audio: { muted: true } });
    await user.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(audio.setMuted).toHaveBeenCalledWith(false);
  });

  it('the volume slider shows the level and changes it by keyboard', async () => {
    const { audio, user } = setup({ audio: { volume: 40 } });
    const slider = screen.getByRole('slider', { name: 'Volume' });
    expect(slider).toHaveAttribute('aria-valuenow', '40');
    expect(slider).toHaveAttribute('aria-valuetext', '40%');
    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(audio.setVolume).toHaveBeenLastCalledWith(41);
    await user.keyboard('{End}');
    expect(audio.setVolume).toHaveBeenLastCalledWith(100);
  });

  it('the volume slider reads 0 while muted (and raising it unmutes via setVolume)', async () => {
    const { audio, user } = setup({ audio: { muted: true, volume: 70 } });
    const slider = screen.getByRole('slider', { name: 'Volume' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(audio.setVolume).toHaveBeenLastCalledWith(1);
  });

  it('hides the volume slider on touch devices and narrow screens', () => {
    setup();
    const volume = screen.getByTestId('volume');
    expect(volume.className).toContain('hidden');
    expect(volume.className).toContain('sm:flex');
    expect(volume.className).toContain('pointer-coarse:hidden');
  });
});

describe('ControlBar: roles', () => {
  it('viewers cannot change playback but keep every local control', async () => {
    const { audio, toggle, onShowShortcuts, user } = setup({ role: 'viewer' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Seek' })).toHaveAttribute('data-disabled');
    await user.click(screen.getByRole('button', { name: 'Mute' }));
    await user.click(screen.getByRole('button', { name: 'Full screen' }));
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(audio.setMuted).toHaveBeenCalledWith(true);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('slider', { name: 'Volume' })).not.toHaveAttribute('data-disabled');
  });

  it('participants ask instead of acting', async () => {
    const { send, user } = setup({ role: 'participant' });
    await user.click(screen.getByRole('button', { name: 'Ask to pause' }));
    expect(send).toHaveBeenCalledWith({ type: 'pause' });
    expect(screen.getByRole('slider', { name: 'Ask to jump to a time' })).toBeInTheDocument();
  });

  it('staff play, pause and seek directly', async () => {
    const { send, user } = setup({ role: 'moderator' });
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(send).toHaveBeenCalledWith({ type: 'pause' });
    screen.getByRole('slider', { name: 'Seek' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(send).toHaveBeenLastCalledWith({ type: 'seek', time: 51 });
  });

  it('shows Play when paused', () => {
    setup({ playState: 'paused' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
  });
});

describe('ControlBar: view controls', () => {
  it('labels the fullscreen button for entering and leaving', () => {
    setup({ immersiveActive: false });
    expect(iconOf(screen.getByRole('button', { name: 'Full screen' }))).toBe('lucide-maximize');
  });

  it('shows the exit control while fullscreen', async () => {
    const { toggle, user } = setup({ immersiveActive: true, variant: 'overlay' });
    const exit = screen.getByRole('button', { name: 'Exit full screen' });
    expect(iconOf(exit)).toBe('lucide-minimize');
    await user.click(exit);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('theater button toggles theater and shows its state', async () => {
    const { toggleTheater, user } = setup({ theaterActive: false });
    const button = screen.getByRole('button', { name: 'Theater mode' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    // Wide screens only: there is no sidebar to make room from below `lg`.
    expect(button.className).toContain('hidden');
    expect(button.className).toContain('lg:inline-flex');
    await user.click(button);
    expect(toggleTheater).toHaveBeenCalledTimes(1);
  });

  it('labels the theater button for returning to the default view', () => {
    setup({ theaterActive: true });
    expect(screen.getByRole('button', { name: 'Default view' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no theater button in fullscreen', () => {
    setup({ variant: 'overlay', immersiveActive: true });
    expect(screen.queryByRole('button', { name: /Theater mode|Default view/ })).toBeNull();
  });

  it('shows the time and an unknown length placeholder', () => {
    setup({ duration: null });
    expect(screen.getByText('0:50 / –:––')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Seek' })).toHaveAttribute('data-disabled');
  });
});

describe('ControlBar: scrubber hover preview', () => {
  const hoverAt = (clientX: number, pointerType = 'mouse'): void => {
    const scrubber = screen.getByTestId('scrubber');
    scrubber.getBoundingClientRect = () => ({ left: 100, width: 400, top: 0, height: 10 }) as DOMRect;
    fireEvent.pointerMove(scrubber, { clientX, pointerType });
  };

  it.each([
    [100, '0:00', '0'],
    [300, '1:40', '50'],
    [500, '3:20', '100'],
    [40, '0:00', '0'],
    [900, '3:20', '100'],
  ])('mouse at x=%s shows %s at %s%%', (x, time, left) => {
    setup({ duration: 200 });
    hoverAt(x);
    const label = screen.getByTestId('scrubber-hover-time');
    expect(label).toHaveTextContent(time);
    expect(label.style.left).toBe(`${left}%`);
  });

  it('disappears when the pointer leaves', () => {
    setup();
    hoverAt(300);
    fireEvent.pointerLeave(screen.getByTestId('scrubber'));
    expect(screen.queryByTestId('scrubber-hover-time')).toBeNull();
  });

  it('is mouse-only (touch would cover the finger)', () => {
    setup();
    hoverAt(300, 'touch');
    expect(screen.queryByTestId('scrubber-hover-time')).toBeNull();
  });

  it('needs a known length', () => {
    setup({ duration: null });
    hoverAt(300);
    expect(screen.queryByTestId('scrubber-hover-time')).toBeNull();
  });

  it('is hidden from screen readers (the slider already announces the time)', () => {
    setup();
    hoverAt(300);
    expect(screen.getByTestId('scrubber-hover-time')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ControlBar: approvals in fullscreen', () => {
  it('staff see a pending-requests button with the count in fullscreen', () => {
    setup({ variant: 'overlay', requests: [request('r1'), request('r2')] });
    expect(screen.getByRole('button', { name: 'Pending requests (2)' })).toBeVisible();
  });

  it('opens the requests dialog and approves from it without leaving fullscreen', async () => {
    const { harness, user } = setup({ variant: 'overlay', requests: [request('r1')] });
    await user.click(screen.getByRole('button', { name: 'Pending requests (1)' }));
    const dialog = screen.getByRole('dialog', { name: 'Pending requests' });
    expect(within(dialog).getByText(/Pat/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: /Approve/ }));
    expect(harness.rpc).toHaveBeenCalledWith('resolve_request', { requestId: 'r1', approve: true });
  });

  it('keeps the dialog open (showing it is empty) when the last request resolves', async () => {
    const { harness, user } = setup({ variant: 'overlay', requests: [request('r1')] });
    await user.click(screen.getByRole('button', { name: 'Pending requests (1)' }));
    harness.store.setState({ requests: [] });
    expect(await screen.findByText('No pending requests.')).toBeVisible();
  });

  it('the button appears live when a request arrives', async () => {
    const { harness } = setup({ variant: 'overlay' });
    expect(screen.queryByRole('button', { name: /Pending requests/ })).toBeNull();
    harness.store.setState({ requests: [request('r9')] });
    expect(await screen.findByRole('button', { name: 'Pending requests (1)' })).toBeVisible();
  });

  it('no button without pending requests', () => {
    setup({ variant: 'overlay' });
    expect(screen.queryByRole('button', { name: /Pending requests/ })).toBeNull();
  });

  it.each(['participant', 'viewer'] as const)('never shown to a %s', (role) => {
    setup({ role, variant: 'overlay', requests: [request('r1')] });
    expect(screen.queryByRole('button', { name: /Pending requests/ })).toBeNull();
  });

  it('not shown in the docked bar (the sidebar tab does that job)', () => {
    setup({ variant: 'docked', requests: [request('r1')] });
    expect(screen.queryByRole('button', { name: /Pending requests/ })).toBeNull();
  });
});
