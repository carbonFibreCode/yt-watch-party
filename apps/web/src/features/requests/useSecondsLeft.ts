import { useEffect, useState } from 'react';
import { useServerClock } from '@/features/room/RoomContext';

const SECOND_MS = 1000;

/** Whole seconds until `deadline` (server time), ticking once a second. */
export const useSecondsLeft = (deadline: number): number => {
  const clock = useServerClock();
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(clock.now());
    }, SECOND_MS);
    return () => {
      clearInterval(interval);
    };
  }, [clock]);
  return Math.max(0, Math.ceil((deadline - now) / SECOND_MS));
};
