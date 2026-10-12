import { motion } from 'motion/react';
import { useCallback, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ReactionBar } from '@/features/reactions/ReactionBar';
import { usePendingRequestsForStaff } from '@/features/requests/usePendingRequestsForStaff';
import { useRoom, useServerClock } from '@/features/room/RoomContext';
import { cn } from '@/lib/utils';
import { projectPosition, timelineFromView } from '@watchparty/shared';
import { ControlBar } from './ControlBar';
import type { AudioControls, ToggleControl } from './ControlBar';
import { usePlayerPrefs } from './playerPrefs';
import { PlayerSurface } from './PlayerSurface';
import { ShortcutsDialog } from './ShortcutsDialog';
import { useAutoHide } from './useAutoHide';
import { useImmersive } from './useImmersive';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { usePlaybackCommand } from './usePlaybackCommand';
import { usePlayerSync } from './usePlayerSync';
import { useRelativeSeek } from './useRelativeSeek';
import { VideoUrlForm } from './VideoUrlForm';

/** How long the fullscreen controls take to fade in or out. */
const FADE_S = 0.2;

/** Synchronized player, now-playing title and the role-aware controls (LLD SP-13, SP-21). */
export function PlayerColumn(): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const sync = usePlayerSync(containerRef);
  const command = usePlaybackCommand();
  const clock = useServerClock();
  const immersive = useImmersive();
  const theaterActive = usePlayerPrefs((s) => s.theater);
  const toggleTheater = usePlayerPrefs((s) => s.toggleTheater);
  const pendingForStaff = usePendingRequestsForStaff();
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const playback = useRoom((s) => s.playback);
  const video = playback?.video ?? null;
  const playing = playback?.playState === 'playing';
  const canControl = command.mode === 'direct';
  const duration =
    sync.duration !== null && sync.duration.videoId === playback?.videoId
      ? sync.duration.seconds
      : (playback?.duration ?? null);

  const position = useCallback(
    () => (playback === null ? 0 : projectPosition(timelineFromView(playback), clock.now())),
    [playback, clock],
  );
  const seek = useRelativeSeek({ send: command.send, position, rev: playback?.rev ?? null, duration });
  const autoHide = useAutoHide({
    active: immersive.active,
    playing,
    keepVisible: pendingForStaff > 0 || menuOpen,
  });
  const openHelp = useCallback(() => {
    setHelpOpen(true);
  }, []);
  const audio: AudioControls = {
    muted: sync.muted,
    volume: sync.volume,
    setMuted: sync.setMuted,
    setVolume: sync.setVolume,
  };
  const theater: ToggleControl = { active: theaterActive, toggle: toggleTheater };
  useKeyboardShortcuts({
    canControl,
    hasVideo: video !== null,
    playing,
    duration,
    playbackRate: playback?.playbackRate ?? 1,
    send: command.send,
    ...seek,
    ...audio,
    immersive: immersive.active,
    toggleImmersive: immersive.toggle,
    exitImmersive: immersive.exit,
    openHelp,
    toggleTheater,
  });

  const controlBar = (variant: 'docked' | 'overlay'): ReactElement => (
    <ControlBar
      command={command}
      duration={duration}
      audio={audio}
      immersive={immersive}
      theater={theater}
      onShowShortcuts={openHelp}
      variant={variant}
      onMenuOpenChange={setMenuOpen}
    />
  );

  return (
    <div className="grid gap-3">
      {/* The same element in both modes, so the YouTube iframe is never remounted (no reload). */}
      <div
        data-testid="player-frame"
        data-immersive={immersive.active}
        data-theater={theaterActive && !immersive.active}
        className={cn(
          immersive.active
            ? // Follows the device orientation; safe areas keep controls clear of notches and bars.
              'fixed inset-0 z-40 flex flex-col bg-black pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]'
            : 'grid gap-3',
          // Theater: as wide as possible while a 16:9 player and its controls still fit the screen.
          !immersive.active && theaterActive && 'mx-auto w-full lg:max-w-[calc((100dvh-12rem)*16/9)]',
          immersive.active && autoHide.hidden && 'cursor-none',
        )}
      >
        <PlayerSurface
          containerRef={containerRef}
          sync={sync}
          canControl={canControl}
          immersive={immersive.active}
          canSeek={canControl}
          onSeekBy={seek.seekBy}
          onToggleImmersive={immersive.toggle}
        >
          {immersive.active && (
            <motion.div
              data-testid="fullscreen-controls"
              data-hidden={autoHide.hidden}
              className="absolute inset-x-0 bottom-0"
              initial={false}
              animate={autoHide.hidden ? { opacity: 0, y: 8 } : { opacity: 1, y: 0 }}
              transition={{ duration: FADE_S }}
              // Invisible controls must not be clickable or reachable with Tab.
              inert={autoHide.hidden}
              {...autoHide.bind}
            >
              {controlBar('overlay')}
            </motion.div>
          )}
        </PlayerSurface>
        {!immersive.active && controlBar('docked')}
      </div>
      {video !== null && (
        <div className="flex min-w-0 flex-wrap items-center gap-3 px-1">
          <img
            src={video.thumbnailUrl}
            alt=""
            className="bg-muted border-foreground aspect-video h-9 shrink-0 border object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="neo-eyebrow text-muted-foreground">Now playing</p>
            <p className="font-display truncate text-lg leading-tight font-semibold" title={video.title}>
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
