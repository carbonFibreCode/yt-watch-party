import { useCallback, useLayoutEffect, useRef } from 'react';
import { SEEK_COALESCE_MS } from '@watchparty/shared';
import type { RequestableAction } from '@watchparty/shared';

interface RelativeSeekOptions {
  readonly send: (action: RequestableAction) => Promise<boolean>;
  /** The room's current position (projected from the server timeline). */
  readonly position: () => number;
  /** The room's playback revision; it changes once the server has applied a seek. */
  readonly rev: number | null;
  /** Video length in seconds, once known (seeks clamp to it). */
  readonly duration: number | null;
}

export interface RelativeSeek {
  readonly seekTo: (time: number) => void;
  readonly seekBy: (deltaS: number) => void;
}

interface PendingSeek {
  readonly time: number;
  readonly fromRev: number | null;
  readonly count: number;
  readonly at: number;
}

/**
 * Seeks that add up when repeated quickly, like YouTube (J J J = −30 s), shared by the keyboard
 * and the double-tap gestures. Until the room has applied every one of this client's seeks (each
 * bumps the revision by one) or SEEK_COALESCE_MS passes, a relative seek starts from the last
 * target instead of the position the room has not updated yet. A refused seek simply expires.
 */
export const useRelativeSeek = (options: RelativeSeekOptions): RelativeSeek => {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const pending = useRef<PendingSeek | null>(null);

  const unconfirmed = useCallback((): PendingSeek | null => {
    const seek = pending.current;
    const { rev } = latest.current;
    if (seek === null || Date.now() - seek.at >= SEEK_COALESCE_MS) {
      return null;
    }
    const confirmed = rev !== null && seek.fromRev !== null && rev >= seek.fromRev + seek.count;
    return confirmed ? null : seek;
  }, []);

  const seekTo = useCallback(
    (time: number) => {
      const { send, rev, duration } = latest.current;
      const target = Math.min(Math.max(0, time), duration ?? Number.POSITIVE_INFINITY);
      const previous = unconfirmed();
      pending.current = {
        time: target,
        fromRev: previous === null ? rev : previous.fromRev,
        count: previous === null ? 1 : previous.count + 1,
        at: Date.now(),
      };
      void send({ type: 'seek', time: target });
    },
    [unconfirmed],
  );

  const seekBy = useCallback(
    (deltaS: number) => {
      seekTo((unconfirmed()?.time ?? latest.current.position()) + deltaS);
    },
    [seekTo, unconfirmed],
  );

  return { seekTo, seekBy };
};
