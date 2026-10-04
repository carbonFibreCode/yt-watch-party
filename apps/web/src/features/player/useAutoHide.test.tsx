import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTROLS_IDLE_MS } from '@watchparty/shared';
import { useAutoHide } from './useAutoHide';

type Options = Parameters<typeof useAutoHide>[0];
const ON: Options = { active: true, playing: true, keepVisible: false };

/** Let the idle timer run out. */
const goIdle = (): void => {
  act(() => {
    vi.advanceTimersByTime(CONTROLS_IDLE_MS + 10);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAutoHide', () => {
  it('shows controls at first, hides them after the idle time while playing in fullscreen', () => {
    const { result } = renderHook(() => useAutoHide(ON));
    expect(result.current.hidden).toBe(false);
    act(() => {
      vi.advanceTimersByTime(CONTROLS_IDLE_MS - 100);
    });
    expect(result.current.hidden).toBe(false);
    goIdle();
    expect(result.current.hidden).toBe(true);
  });

  it.each([
    ['mouse movement', () => fireEvent.mouseMove(window)],
    ['a touch', () => fireEvent.touchStart(window)],
    ['a key press', () => fireEvent.keyDown(window, { key: 'a' })],
    ['a click', () => fireEvent.mouseDown(window)],
  ])('%s brings them back', (_label, act_) => {
    const { result } = renderHook(() => useAutoHide(ON));
    goIdle();
    expect(result.current.hidden).toBe(true);
    act(() => {
      act_();
    });
    expect(result.current.hidden).toBe(false);
    goIdle();
    expect(result.current.hidden).toBe(true);
  });

  it.each([
    ['docked (not fullscreen)', { ...ON, active: false }],
    ['paused', { ...ON, playing: false }],
    ['asked to stay (menu open / requests waiting)', { ...ON, keepVisible: true }],
  ])('never hides while %s', (_label, options) => {
    const { result } = renderHook(() => useAutoHide(options));
    goIdle();
    expect(result.current.hidden).toBe(false);
  });

  it('reappears immediately when playback pauses or a request arrives', () => {
    const { result, rerender } = renderHook((o: Options) => useAutoHide(o), { initialProps: ON });
    goIdle();
    expect(result.current.hidden).toBe(true);
    rerender({ ...ON, playing: false });
    expect(result.current.hidden).toBe(false);
    rerender(ON);
    expect(result.current.hidden).toBe(true);
    rerender({ ...ON, keepVisible: true });
    expect(result.current.hidden).toBe(false);
  });

  describe('bound to the control bar', () => {
    function Bar({ options }: { readonly options: Options }) {
      const { hidden, bind } = useAutoHide(options);
      return (
        <div data-testid="bar" data-hidden={hidden} {...bind}>
          <button type="button">One</button>
          <button type="button">Two</button>
        </div>
      );
    }
    const hidden = (): string | undefined => screen.getByTestId('bar').dataset.hidden;

    it('stays while the mouse is over it, hides after it leaves', () => {
      render(<Bar options={ON} />);
      fireEvent.pointerEnter(screen.getByTestId('bar'), { pointerType: 'mouse' });
      goIdle();
      expect(hidden()).toBe('false');
      fireEvent.pointerLeave(screen.getByTestId('bar'));
      expect(hidden()).toBe('true');
    });

    it('a finger resting on it does not pin it (touch has no hover)', () => {
      render(<Bar options={ON} />);
      fireEvent.pointerEnter(screen.getByTestId('bar'), { pointerType: 'touch' });
      goIdle();
      expect(hidden()).toBe('true');
    });

    it('stays while a keyboard user is focused inside, also when moving between its buttons', () => {
      render(<Bar options={ON} />);
      const [one, two] = screen.getAllByRole('button');
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
        return selector === ':focus-visible';
      });
      act(() => {
        one?.focus();
      });
      act(() => {
        two?.focus();
      });
      goIdle();
      expect(hidden()).toBe('false');
      act(() => {
        two?.blur();
      });
      expect(hidden()).toBe('true');
    });

    it('mouse-click focus (not keyboard) does not pin it', () => {
      render(<Bar options={ON} />);
      const [one] = screen.getAllByRole('button');
      vi.spyOn(Element.prototype, 'matches').mockReturnValue(false);
      act(() => {
        one?.focus();
      });
      goIdle();
      expect(hidden()).toBe('true');
    });
  });
});
