import { useCallback, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ReactionBar } from '@/features/reactions/ReactionBar';
import { useRoom, useServerClock } from '@/features/room/RoomContext';
import { cn } from '@/lib/utils';
import { projectPosition, timelineFromView } from '@watchparty/shared';
import { ControlBar } from './ControlBar';
import type { AudioControls } from './ControlBar';
import { PlayerSurface } from './PlayerSurface';
import { ShortcutsDialog } from './ShortcutsDialog';
import { useImmersive } from './useImmersive';
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
  const immersive = useImmersive();
  const [helpOpen, setHelpOpen] = useState(false);
  const playback = useRoom((s) => s.playback);
  const video = playback?.video ?? null;
  const canControl = command.mode === 'direct';
  const duration =
    sync.duration !== null && sync.duration.videoId === playback?.videoId
      ? sync.duration.seconds
      : (playback?.duration ?? null);

  const position = useCallback(
    () => (playback === null ? 0 : projectPosition(timelineFromView(playback), clock.now())),
    [playback, clock],
  );
  const openHelp = useCallback(() => {
    setHelpOpen(true);
  }, []);
  const audio: AudioControls = {
    muted: sync.muted,
    volume: sync.volume,
    setMuted: sync.setMuted,
    setVolume: sync.setVolume,
  };
  useKeyboardShortcuts({
    canControl,
    hasVideo: video !== null,
    playing: playback?.playState === 'playing',
    duration,
    position,
    rev: playback?.rev ?? null,
    send: command.send,
    ...audio,
    immersive: immersive.active,
    toggleImmersive: immersive.toggle,
    exitImmersive: immersive.exit,
    openHelp,
  });

  const controlBar = (variant: 'docked' | 'overlay'): ReactElement => (
    <ControlBar
      command={command}
      duration={duration}
      audio={audio}
      immersive={immersive}
      onShowShortcuts={openHelp}
      variant={variant}
    />
  );

  return (
    <div className="grid gap-3">
      {/* The same element in both modes, so the YouTube iframe is never remounted (no reload). */}
      <div
        data-testid="player-frame"
        data-immersive={immersive.active}
        className={cn(
          immersive.active
            ? // Follows the device orientation; safe areas keep controls clear of notches and bars.
              'fixed inset-0 z-40 flex flex-col bg-black pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]'
            : 'grid gap-3',
        )}
      >
        <PlayerSurface
          containerRef={containerRef}
          sync={sync}
          canControl={canControl}
          immersive={immersive.active}
        >
          {immersive.active && controlBar('overlay')}
        </PlayerSurface>
        {!immersive.active && controlBar('docked')}
      </div>
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
      <VideoUrlForm command={command} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} canControl={canControl} />
    </div>
  );
}
