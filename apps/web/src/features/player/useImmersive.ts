import { useCallback, useEffect, useRef, useState } from 'react';
import screenfull from 'screenfull';

export interface Immersive {
  /** The player fills the screen. */
  readonly active: boolean;
  /** The browser can go truly fullscreen (false on iPhone, where the player fills the viewport). */
  readonly native: boolean;
  readonly toggle: () => void;
  readonly exit: () => void;
}

const ignore = (): void => undefined;

/**
 * Fullscreen for the player (plan §15.4 Step 1.7). The whole page goes fullscreen and the player
 * is stretched over it with CSS, so dialogs, menus and the host's approval toasts (all portaled
 * to <body>) stay visible above it. Orientation is never locked: the layout follows the device.
 */
export const useImmersive = (): Immersive => {
  const [active, setActive] = useState(false);
  /** What the viewer last asked for; a slow fullscreen request must not override a later exit. */
  const wanted = useRef(false);

  const enter = useCallback(() => {
    wanted.current = true;
    setActive(true);
    if (screenfull.isEnabled && !screenfull.isFullscreen) {
      screenfull
        .request(document.documentElement, { navigationUI: 'hide' })
        .then(() => {
          if (!wanted.current && screenfull.isFullscreen) {
            screenfull.exit().catch(ignore);
          }
        })
        // Refused (e.g. no user gesture): the CSS layer still fills the window.
        .catch(ignore);
    }
  }, []);

  const exit = useCallback(() => {
    wanted.current = false;
    setActive(false);
    if (screenfull.isEnabled && screenfull.isFullscreen) {
      screenfull.exit().catch(ignore);
    }
  }, []);

  const toggle = useCallback(() => {
    if (wanted.current) {
      exit();
    } else {
      enter();
    }
  }, [enter, exit]);

  // The browser left fullscreen on its own (Esc, system gesture): follow it.
  useEffect(() => {
    if (!screenfull.isEnabled) {
      return;
    }
    const onChange = (): void => {
      if (!screenfull.isFullscreen) {
        wanted.current = false;
        setActive(false);
      }
    };
    screenfull.on('change', onChange);
    return () => {
      screenfull.off('change', onChange);
    };
  }, []);

  // No page scrolling behind the fullscreen player.
  useEffect(() => {
    if (!active) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);

  // Leaving the room while fullscreen must not leave the next page stuck in fullscreen.
  useEffect(
    () => () => {
      if (wanted.current && screenfull.isEnabled && screenfull.isFullscreen) {
        screenfull.exit().catch(ignore);
      }
    },
    [],
  );

  return { active, native: screenfull.isEnabled, toggle, exit };
};
