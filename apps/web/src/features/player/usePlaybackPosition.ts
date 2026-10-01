import { useEffect, useState } from 'react';
import { useRoom, useServerClock } from '@/features/room/RoomContext';
import { projectPosition, timelineFromView, UI_TIME_REFRESH_MS } from '@watchparty/shared';

/**
 * The room's canonical playback position for display, projected from the server timeline with
 * the synced clock (the same math as the server and the SyncEngine). Ticks only while playing;
 * until the first tick a stale `now` simply clamps to the server's anchor position.
 */
export const usePlaybackPosition = (): number => {
  const playback = useRoom((s) => s.playback);
  const clock = useServerClock();
  const [now, setNow] = useState(() => clock.now());
  const playing = playback?.playState === 'playing';

  useEffect(() => {
    if (!playing) {
      return;
    }
    const interval = setInterval(() => {
      setNow(clock.now());
    }, UI_TIME_REFRESH_MS);
    return () => {
      clearInterval(interval);
    };
  }, [playing, clock]);

  return playback === null ? 0 : projectPosition(timelineFromView(playback), now);
};
