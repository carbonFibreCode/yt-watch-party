import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useRoomStore } from '@/features/room/RoomContext';
import type { ReactionView } from '@watchparty/shared';
import { REACTION_FLOAT_MS } from '@watchparty/shared';

interface Floating {
  readonly reaction: ReactionView;
  /** Horizontal start, % of the player width. */
  readonly x: number;
}

/** Spread the floats across the middle of the player, away from the edges. */
const X_MIN = 10;
const X_RANGE = 80;
const RISE_PX = -220;

/** Emojis float up over the player as reactions arrive. Decorative, so hidden from assistive tech. */
export function ReactionOverlay(): ReactElement {
  const store = useRoomStore();
  const [floating, setFloating] = useState<readonly Floating[]>([]);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.reactions === previous.reactions || state.reactions.length === 0) {
        return;
      }
      const seen = new Set(previous.reactions.map((r) => r.id));
      const fresh = state.reactions.filter((r) => !seen.has(r.id));
      if (fresh.length === 0) {
        return;
      }
      setFloating((current) => [
        ...current,
        ...fresh.map((reaction) => ({ reaction, x: X_MIN + Math.random() * X_RANGE })),
      ]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        const ids = new Set(fresh.map((r) => r.id));
        setFloating((current) => current.filter((f) => !ids.has(f.reaction.id)));
      }, REACTION_FLOAT_MS);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [store]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {floating.map(({ reaction, x }) => (
          <motion.span
            key={reaction.id}
            className="absolute bottom-4 text-3xl drop-shadow-lg"
            style={{ left: `${String(x)}%` }}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: RISE_PX, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: REACTION_FLOAT_MS / 1000, ease: 'easeOut' }}
          >
            {reaction.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
