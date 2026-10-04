import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderInRoom, roomHarness } from '@/test/roomHarness';
import { PLAYBACK_RATES } from '@watchparty/shared';
import { SpeedMenu } from './SpeedMenu';
import type { ControlMode } from './usePlaybackCommand';

const setup = ({
  mode = 'direct',
  rate = 1,
  hasVideo = true,
}: { mode?: ControlMode; rate?: number; hasVideo?: boolean } = {}) => {
  const send = vi.fn(() => Promise.resolve(true));
  const onOpenChange = vi.fn();
  renderInRoom(
    <SpeedMenu command={{ mode, send }} rate={rate} hasVideo={hasVideo} onOpenChange={onOpenChange} />,
    roomHarness('host'),
  );
  return { send, onOpenChange, user: userEvent.setup() };
};

const trigger = (): HTMLElement => screen.getByRole('button', { name: /^Playback speed/ });

describe('SpeedMenu', () => {
  it('shows the room speed on the button', () => {
    setup({ rate: 1.5 });
    expect(trigger()).toHaveAccessibleName('Playback speed: 1.5×');
    expect(trigger()).toHaveTextContent('1.5×');
  });

  it('shows normal speed as 1× (and "Normal" to screen readers)', () => {
    setup({ rate: 1 });
    expect(trigger()).toHaveAccessibleName('Playback speed: Normal');
    expect(trigger()).toHaveTextContent('1×');
  });

  it('lists every standard speed with the current one checked', async () => {
    const { user } = setup({ rate: 0.75 });
    await user.click(trigger());
    const items = screen.getAllByRole('menuitemradio');
    expect(items).toHaveLength(PLAYBACK_RATES.length);
    expect(screen.getByRole('menuitemradio', { name: '0.75×' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'false');
    expect(within(screen.getByRole('menu')).getByText('Speed for everyone')).toBeVisible();
  });

  it('staff pick a speed for everyone', async () => {
    const { send, user } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole('menuitemradio', { name: '2×' }));
    expect(send).toHaveBeenCalledWith({ type: 'set_rate', rate: 2 });
  });

  it('works from the keyboard (Enter, arrows, Enter)', async () => {
    const { send, user } = setup();
    trigger().focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{End}{Enter}');
    expect(send).toHaveBeenCalledWith({ type: 'set_rate', rate: 2 });
  });

  it('picking the current speed sends nothing', async () => {
    const { send, user } = setup({ rate: 1.25 });
    await user.click(trigger());
    await user.click(screen.getByRole('menuitemradio', { name: '1.25×' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('participants ask the host instead', async () => {
    const { send, user } = setup({ mode: 'request' });
    await user.click(trigger());
    expect(screen.getByText('Ask the host for a speed')).toBeVisible();
    await user.click(screen.getByRole('menuitemradio', { name: '0.5×' }));
    expect(send).toHaveBeenCalledWith({ type: 'set_rate', rate: 0.5 });
  });

  it('viewers see the speed but cannot open the menu', () => {
    setup({ mode: 'none', rate: 1.5 });
    expect(trigger()).toBeDisabled();
    expect(trigger()).toHaveTextContent('1.5×');
  });

  it('is disabled without a video', () => {
    setup({ hasVideo: false });
    expect(trigger()).toBeDisabled();
  });

  it('reports opening and closing (fullscreen controls stay while it is open)', async () => {
    const { onOpenChange, user } = setup();
    await user.click(trigger());
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
