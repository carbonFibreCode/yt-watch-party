import { useCallback, useRef } from 'react';
import type { ReactElement } from 'react';
import { ReactionBar } from '@/features/reactions/ReactionBar';
import { useRoom, useServerClock } from '@/features/room/RoomContext';
import { projectPosition, timelineFromView } from '@watchparty/shared';
import { ControlBar } from './ControlBar';
import { PlayerSurface } from './PlayerSurface';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { usePlaybackCommand } from './usePlaybackCommand';
import { usePlayerSync } from './usePlayerSync';
import { VideoUrlForm } from './VideoUrlForm';

/** Synchronized player, now-playing title and the role-aware controls (LLD SP-13, SP-21). */
export function PlayerColumn(): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const sync = usePlayerSync(containerRef);
  const command = usePlaybackCommand();
  const clock = useServerClock();
  const playback = useRoom((s) => s.playback);
  const video = playback?.video ?? null;
  const duration =
    sync.duration !== null && sync.duration.videoId === playback?.videoId
      ? sync.duration.seconds
      : (playback?.duration ?? null);

  const position = useCallback(
    () => (playback === null ? 0 : projectPosition(timelineFromView(playback), clock.now())),
    [playback, clock],
  );
  useKeyboardShortcuts({
    enabled: command.mode === 'direct' && video !== null,
    playing: playback?.playState === 'playing',
    position,
    send: command.send,
  });

  return (
    <div className="grid gap-3">
      <PlayerSurface containerRef={containerRef} sync={sync} canControl={command.mode === 'direct'} />
      {video !== null && (
        <div className="flex min-w-0 flex-wrap items-center gap-3 px-1">
          <img
            src={video.thumbnailUrl}
            alt=""
            className="bg-muted aspect-video h-9 shrink-0 rounded object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">Now playing</p>
            <p className="truncate text-sm font-medium" title={video.title}>
              {video.title}
            </p>
          </div>
          <ReactionBar />
        </div>
      )}
      <ControlBar command={command} duration={duration} />
      <VideoUrlForm command={command} />
    </div>
  );
}
