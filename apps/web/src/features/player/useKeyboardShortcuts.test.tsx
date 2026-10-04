import { render, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEEK_COALESCE_MS } from '@watchparty/shared';
import type { RequestableAction } from '@watchparty/shared';
import { SHORTCUTS } from './shortcuts';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

type Options = Parameters<typeof useKeyboardShortcuts>[0];

const setup = (overrides: Partial<Options> = {}) => {
  const sent: RequestableAction[] = [];
  const o: Options = {
    canControl: true,
    hasVideo: true,
    playing: true,
    duration: 200,
    position: () => 100,
    rev: 1,
    send: vi.fn((a: RequestableAction) => {
      sent.push(a);
      return Promise.resolve(true);
    }),
    muted: false,
    setMuted: vi.fn(),
    volume: 50,
    setVolume: vi.fn(),
    immersive: false,
    toggleImmersive: vi.fn(),
    exitImmersive: vi.fn(),
    openHelp: vi.fn(),
    ...overrides,
  };
  const hook = renderHook(
    (props: Options) => {
      useKeyboardShortcuts(props);
    },
    { initialProps: o },
  );
  return { o, sent, hook, user: userEvent.setup() };
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('useKeyboardShortcuts: playback (staff)', () => {
  it.each([
    [' ', { type: 'pause' }],
    ['k', { type: 'pause' }],
    ['j', { type: 'seek', time: 90 }],
    ['l', { type: 'seek', time: 110 }],
    ['{ArrowLeft}', { type: 'seek', time: 95 }],
    ['{ArrowRight}', { type: 'seek', time: 105 }],
    ['{Home}', { type: 'seek', time: 0 }],
    ['0', { type: 'seek', time: 0 }],
    ['3', { type: 'seek', time: 60 }],
    ['9', { type: 'seek', time: 180 }],
  ])('%s sends %o', async (key, action) => {
    const { sent, user } = setup();
    await user.keyboard(key);
    expect(sent).toEqual([action]);
  });

  it('Space/K plays when paused', async () => {
    const { sent, user } = setup({ playing: false });
    await user.keyboard(' k');
    expect(sent).toEqual([{ type: 'play' }, { type: 'play' }]);
  });

  it('uses the latest playing state after a re-render', async () => {
    const { sent, user, hook, o } = setup({ playing: true });
    hook.rerender({ ...o, playing: false });
    await user.keyboard('k');
    expect(sent).toEqual([{ type: 'play' }]);
  });

  it('seeks clamp to the start and the end of the video', async () => {
    const early = setup({ position: () => 3 });
    await early.user.keyboard('j{ArrowLeft}');
    expect(early.sent).toEqual([
      { type: 'seek', time: 0 },
      { type: 'seek', time: 0 },
    ]);
    early.hook.unmount();

    const late = setup({ position: () => 196 });
    await late.user.keyboard('l{ArrowRight}');
    expect(late.sent).toEqual([
      { type: 'seek', time: 200 },
      { type: 'seek', time: 200 },
    ]);
  });

  it('seeks forward without an upper bound while the length is unknown', async () => {
    const { sent, user } = setup({ duration: null });
    await user.keyboard('l');
    expect(sent).toEqual([{ type: 'seek', time: 110 }]);
  });

  it('number keys do nothing until the length is known', async () => {
    const { sent, user } = setup({ duration: null });
    await user.keyboard('5');
    expect(sent).toEqual([]);
  });

  it('nothing playback-related works without a video', async () => {
    const { sent, user } = setup({ hasVideo: false });
    await user.keyboard(' kjl{ArrowLeft}{ArrowRight}{Home}5');
    expect(sent).toEqual([]);
  });

  it('participants and viewers cannot change playback by keyboard', async () => {
    const { sent, user, o } = setup({ canControl: false });
    await user.keyboard(' kjl{ArrowLeft}{ArrowRight}{Home}5');
    expect(sent).toEqual([]);
    // …but their local shortcuts still work.
    await user.keyboard('mf?{ArrowUp}');
    expect(o.setMuted).toHaveBeenCalledWith(true);
    expect(o.toggleImmersive).toHaveBeenCalledTimes(1);
    expect(o.openHelp).toHaveBeenCalledTimes(1);
    expect(o.setVolume).toHaveBeenCalledWith(55);
  });

  it('loses control the moment the role changes', async () => {
    const { sent, user, hook, o } = setup();
    hook.rerender({ ...o, canControl: false });
    await user.keyboard('k');
    expect(sent).toEqual([]);
  });
});

describe('useKeyboardShortcuts: rapid seeks add up', () => {
  let now = 1_000_000;
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('J J J before the room confirms jumps back 30 s, not 10 s', async () => {
    const { sent, user } = setup();
    await user.keyboard('jjj');
    expect(sent.map((a) => (a.type === 'seek' ? a.time : null))).toEqual([90, 80, 70]);
  });

  it('mixed keys accumulate too (L → ← → 0-9 → J)', async () => {
    const { sent, user } = setup();
    await user.keyboard('l{ArrowLeft}5j');
    expect(sent.map((a) => (a.type === 'seek' ? a.time : null))).toEqual([110, 105, 100, 90]);
  });

  it('once the room applies the seek (new revision) the next one starts from the room', async () => {
    const { sent, user, hook, o } = setup();
    await user.keyboard('j');
    hook.rerender({ ...o, rev: 2, position: () => 42 });
    await user.keyboard('j');
    expect(sent.map((a) => (a.type === 'seek' ? a.time : null))).toEqual([90, 32]);
  });

  it('waits for every one of its seeks to be applied, not just the first', async () => {
    const { sent, user, hook, o } = setup();
    await user.keyboard('jj');
    // The room applied only the first J (one revision later) and shows 1:30.
    hook.rerender({ ...o, rev: 2, position: () => 90 });
    await user.keyboard('{ArrowRight}');
    // Builds on the second J's target (80), not the half-updated position.
    hook.rerender({ ...o, rev: 3, position: () => 80 });
    expect(sent.map((a) => (a.type === 'seek' ? a.time : null))).toEqual([90, 80, 85]);
    // All three applied: back to following the room.
    hook.rerender({ ...o, rev: 4, position: () => 85 });
    await user.keyboard('l');
    expect(sent.at(-1)).toEqual({ type: 'seek', time: 95 });
  });

  it('an unconfirmed seek (e.g. refused) stops counting after a moment', async () => {
    const { sent, user } = setup();
    await user.keyboard('j');
    now += SEEK_COALESCE_MS;
    await user.keyboard('j');
    expect(sent.map((a) => (a.type === 'seek' ? a.time : null))).toEqual([90, 90]);
  });

  it('accumulated seeks still clamp at both ends', async () => {
    const { sent, user } = setup({ position: () => 15 });
    await user.keyboard('jjl');
    expect(sent.map((a) => (a.type === 'seek' ? a.time : null))).toEqual([5, 0, 10]);
  });

  it('Home then L goes to 0:10', async () => {
    const { sent, user } = setup();
    await user.keyboard('{Home}l');
    expect(sent.map((a) => (a.type === 'seek' ? a.time : null))).toEqual([0, 10]);
  });
});

describe('useKeyboardShortcuts: local (everyone)', () => {
  it('M toggles mute both ways', async () => {
    const muted = setup({ muted: false });
    await muted.user.keyboard('m');
    expect(muted.o.setMuted).toHaveBeenLastCalledWith(true);
    muted.hook.unmount();
    const unmuted = setup({ muted: true });
    await unmuted.user.keyboard('m');
    expect(unmuted.o.setMuted).toHaveBeenLastCalledWith(false);
  });

  it('↑/↓ step the volume by 5 (the store clamps)', async () => {
    const { o, user } = setup({ volume: 50 });
    await user.keyboard('{ArrowUp}{ArrowDown}');
    expect(vi.mocked(o.setVolume).mock.calls).toEqual([[55], [45]]);
  });

  it('F toggles full screen', async () => {
    const { o, user } = setup();
    await user.keyboard('ff');
    expect(o.toggleImmersive).toHaveBeenCalledTimes(2);
  });

  it('Esc exits full screen only while in it', async () => {
    const docked = setup({ immersive: false });
    await docked.user.keyboard('{Escape}');
    expect(docked.o.exitImmersive).not.toHaveBeenCalled();
    docked.hook.unmount();
    const full = setup({ immersive: true });
    await full.user.keyboard('{Escape}');
    expect(full.o.exitImmersive).toHaveBeenCalledTimes(1);
  });

  it('? (Shift+/) opens the shortcuts help; plain / does not', async () => {
    const { o, user } = setup();
    await user.keyboard('/');
    expect(o.openHelp).not.toHaveBeenCalled();
    await user.keyboard('?');
    expect(o.openHelp).toHaveBeenCalledTimes(1);
  });
});

describe('useKeyboardShortcuts: never steals keys', () => {
  it.each(['input', 'textarea', 'select'])('ignores every shortcut while typing in a %s', async (tag) => {
    const { sent, o, user } = setup();
    const field = document.createElement(tag);
    document.body.appendChild(field);
    field.focus();
    await user.keyboard(' kjlmf?3{ArrowUp}{ArrowLeft}');
    expect(sent).toEqual([]);
    expect(o.setMuted).not.toHaveBeenCalled();
    expect(o.toggleImmersive).not.toHaveBeenCalled();
    expect(o.openHelp).not.toHaveBeenCalled();
    expect(o.setVolume).not.toHaveBeenCalled();
  });

  it('ignores a contenteditable region', async () => {
    const { sent, user } = setup();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    // jsdom does not make contenteditable focusable on its own; browsers do.
    editor.tabIndex = 0;
    document.body.appendChild(editor);
    editor.focus();
    expect(document.activeElement).toBe(editor);
    await user.keyboard('k');
    expect(sent).toEqual([]);
  });

  it('ignores modifier combos (browser and OS shortcuts keep working)', async () => {
    const { sent, o, user } = setup();
    await user.keyboard('{Control>}k{/Control}{Meta>}l{/Meta}{Alt>}m{/Alt}{Control>}f{/Control}');
    expect(sent).toEqual([]);
    expect(o.setMuted).not.toHaveBeenCalled();
    expect(o.toggleImmersive).not.toHaveBeenCalled();
  });

  it('Space on a focused button presses that button and does not toggle playback', async () => {
    const onClick = vi.fn();
    const { sent, user } = setup();
    render(
      <button type="button" onClick={onClick}>
        Approve
      </button>,
    );
    const button = document.querySelector('button');
    button?.focus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([]);
  });

  it('K still toggles playback while a button has focus', async () => {
    const { sent, user } = setup();
    render(<button type="button">Something</button>);
    document.querySelector('button')?.focus();
    await user.keyboard('k');
    expect(sent).toEqual([{ type: 'pause' }]);
  });

  it.each(['slider', 'tablist', 'menu', 'radiogroup', 'listbox'])(
    'arrow and Home keys inside a %s are left to that widget',
    async (role) => {
      const { sent, o, user } = setup();
      const host = document.createElement('div');
      host.setAttribute('role', role);
      const inner = document.createElement('div');
      inner.tabIndex = 0;
      host.appendChild(inner);
      document.body.appendChild(host);
      inner.focus();
      await user.keyboard('{ArrowLeft}{ArrowRight}{ArrowUp}{ArrowDown}{Home}');
      expect(sent).toEqual([]);
      expect(o.setVolume).not.toHaveBeenCalled();
    },
  );

  it('does nothing while focus is inside a dialog', async () => {
    const { sent, o, user } = setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inside = document.createElement('div');
    inside.tabIndex = 0;
    dialog.appendChild(inside);
    document.body.appendChild(dialog);
    inside.focus();
    await user.keyboard('kmf?{Escape}');
    expect(sent).toEqual([]);
    expect(o.setMuted).not.toHaveBeenCalled();
    expect(o.toggleImmersive).not.toHaveBeenCalled();
  });

  it('skips keys another handler already consumed (e.g. Esc closing a menu)', async () => {
    const { o, user } = setup({ immersive: true });
    const consume = (event: KeyboardEvent): void => {
      event.preventDefault();
    };
    document.addEventListener('keydown', consume, { capture: true });
    await user.keyboard('{Escape}m');
    document.removeEventListener('keydown', consume, { capture: true });
    expect(o.exitImmersive).not.toHaveBeenCalled();
    expect(o.setMuted).not.toHaveBeenCalled();
  });

  it('prevents the browser default for keys it handles (no page scroll on Space/arrows)', () => {
    setup();
    const space = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    document.body.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
  });

  it('stops listening when unmounted', async () => {
    const { sent, o, hook, user } = setup();
    hook.unmount();
    await user.keyboard('km');
    expect(sent).toEqual([]);
    expect(o.setMuted).not.toHaveBeenCalled();
  });
});

describe('SHORTCUTS table', () => {
  it('has unique ids and no key bound twice', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = SHORTCUTS.flatMap((s) => s.keys.split(',').map((k) => k.trim()));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry has a label and keys to show', () => {
    for (const s of SHORTCUTS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.display.length).toBeGreaterThan(0);
    }
  });
});
