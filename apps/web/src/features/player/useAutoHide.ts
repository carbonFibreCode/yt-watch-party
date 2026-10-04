import { useIdle } from '@uidotdev/usehooks';
import { useState } from 'react';
import type { FocusEvent, PointerEvent } from 'react';
import { CONTROLS_IDLE_MS } from '@watchparty/shared';

interface AutoHideOptions {
  /** Only fullscreen controls auto-hide. */
  readonly active: boolean;
  readonly playing: boolean;
  /** Something needs the controls on screen (an open menu, requests waiting for staff). */
  readonly keepVisible: boolean;
}

export interface AutoHide {
  readonly hidden: boolean;
  /** Spread onto the control bar's wrapper. */
  readonly bind: {
    readonly onPointerEnter: (event: PointerEvent) => void;
    readonly onPointerLeave: () => void;
    readonly onFocus: (event: FocusEvent) => void;
    readonly onBlur: (event: FocusEvent) => void;
  };
}

const isKeyboardFocus = (element: Element): boolean => {
  try {
    return element.matches(':focus-visible');
  } catch {
    // Engines without :focus-visible: treat focus as keyboard focus (never hide under it).
    return true;
  }
};

/**
 * YouTube-style auto-hide (plan §15.5 Step 2.1): in fullscreen, while playing, the controls fade
 * out after CONTROLS_IDLE_MS without pointer, touch or key activity. They stay while the mouse is
 * over them, while a keyboard user is focused inside them, and whenever `keepVisible`.
 */
export const useAutoHide = ({ active, playing, keepVisible }: AutoHideOptions): AutoHide => {
  const idle = useIdle(CONTROLS_IDLE_MS);
  const [hovering, setHovering] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  return {
    hidden: active && playing && idle && !keepVisible && !hovering && !keyboardFocus,
    bind: {
      onPointerEnter: (event) => {
        if (event.pointerType === 'mouse') {
          setHovering(true);
        }
      },
      onPointerLeave: () => {
        setHovering(false);
      },
      onFocus: (event) => {
        setKeyboardFocus(isKeyboardFocus(event.target));
      },
      onBlur: (event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node && event.currentTarget.contains(next))) {
          setKeyboardFocus(false);
        }
      },
    },
  };
};
