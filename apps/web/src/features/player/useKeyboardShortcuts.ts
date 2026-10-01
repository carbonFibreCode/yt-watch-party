import { useEffect } from 'react';
import { SEEK_STEP_S } from '@watchparty/shared';
import type { RequestableAction } from '@watchparty/shared';

interface ShortcutOptions {
  readonly enabled: boolean;
  readonly playing: boolean;
  readonly position: () => number;
  readonly send: (action: RequestableAction) => Promise<boolean>;
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Space/K toggles play, ←/→ jump 5 s. Staff only (requests by keyboard would be too easy to spam). */
export const useKeyboardShortcuts = ({ enabled, playing, position, send }: ShortcutOptions): void => {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTyping(event.target)
      ) {
        return;
      }
      const action: RequestableAction | null =
        event.key === ' ' || event.key === 'k'
          ? { type: playing ? 'pause' : 'play' }
          : event.key === 'ArrowRight'
            ? { type: 'seek', time: position() + SEEK_STEP_S }
            : event.key === 'ArrowLeft'
              ? { type: 'seek', time: Math.max(0, position() - SEEK_STEP_S) }
              : null;
      if (action !== null) {
        event.preventDefault();
        void send(action);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, playing, position, send]);
};
