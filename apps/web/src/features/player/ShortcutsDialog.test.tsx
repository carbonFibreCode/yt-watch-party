import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SHORTCUTS } from './shortcuts';
import { ShortcutsDialog } from './ShortcutsDialog';

const rows = (): HTMLElement[] => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('ShortcutsDialog', () => {
  it('renders nothing while closed', () => {
    render(<ShortcutsDialog open={false} onOpenChange={vi.fn()} canControl />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists every shortcut from the shared table, with its keys', () => {
    render(<ShortcutsDialog open onOpenChange={vi.fn()} canControl />);
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    expect(rows()).toHaveLength(SHORTCUTS.length);
    const play = rows().find((r) => r.textContent.includes('Play or pause'));
    expect(play).toBeDefined();
    expect(within(play!).getAllByText(/^(Space|K)$/)).toHaveLength(2);
    expect(screen.getByText('Jump back 10 seconds')).toBeVisible();
  });

  it('marks playback shortcuts as staff-only for participants and viewers', () => {
    render(<ShortcutsDialog open onOpenChange={vi.fn()} canControl={false} />);
    const staffRows = rows().filter((r) => r.dataset.unavailable === 'true');
    expect(staffRows).toHaveLength(SHORTCUTS.filter((s) => s.scope === 'staff').length);
    expect(screen.getAllByText('Host and moderators')).toHaveLength(staffRows.length);
    expect(screen.getByText(/rest work for you/)).toBeVisible();
  });

  it('marks nothing as unavailable for staff', () => {
    render(<ShortcutsDialog open onOpenChange={vi.fn()} canControl />);
    expect(screen.queryByText('Host and moderators')).toBeNull();
    expect(screen.getByText(/change the video for everyone/)).toBeVisible();
  });

  it('closes with Escape', async () => {
    const onOpenChange = vi.fn();
    render(<ShortcutsDialog open onOpenChange={onOpenChange} canControl />);
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
