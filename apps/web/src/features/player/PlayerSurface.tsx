import { Film, Gauge, Loader2, MonitorX, Play, RefreshCw, VolumeX, WifiOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import type { MouseEvent, ReactElement, ReactNode, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { ReactionOverlay } from '@/features/reactions/ReactionOverlay';
import { useRoom } from '@/features/room/RoomContext';
import { formatRate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SEEK_FEEDBACK_MS, SEEK_STEP_LONG_S } from '@watchparty/shared';
import { isPlaybackError } from './SyncEngine';
import type { PlaybackErrorStatus } from './SyncEngine';
import type { PlayerSync } from './usePlayerSync';

const PLAYBACK_ERROR_REASON: Readonly<Record<PlaybackErrorStatus, string>> = {
  // Usually the owner disabled embedding, but YouTube reports some other refusals with these codes.
  embed_error: "YouTube won't play it in embedded players (usually the owner disabled embedding).",
  video_unavailable: "It's private or has been removed.",
  player_rejected: 'YouTube refused to load it in this player on your device.',
};

interface PlayerSurfaceProps {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly sync: PlayerSync;
  readonly canControl: boolean;
  /** Fullscreen: fill the available space instead of keeping 16:9 (YouTube letterboxes itself). */
  readonly immersive?: boolean;
  /** Drawn above everything else (the fullscreen control bar). */
  readonly children?: ReactNode;
  /** Double-tap on the left/right third: jump back/forward (staff only, see `canSeek`). */
  readonly onSeekBy?: (deltaS: number) => void;
  readonly canSeek?: boolean;
  /** Double-tap in the middle third: toggle fullscreen (everyone). */
  readonly onToggleImmersive?: () => void;
}

type Side = 'left' | 'right';

/**
 * The video area: the YouTube iframe under an input-blocking layer (native controls must never
 * produce intents, LLD SP-13), plus every playback state the viewer needs to know about.
 */
export function PlayerSurface({
  containerRef,
  sync,
  canControl,
  immersive = false,
  children,
  onSeekBy,
  canSeek = false,
  onToggleImmersive,
}: PlayerSurfaceProps): ReactElement {
  const hasVideo = useRoom((s) => s.playback !== null && s.playback.videoId !== null);
  const roomRate = useRoom((s) => s.playback?.playbackRate ?? 1);
  const { status } = sync;
  const [feedback, setFeedback] = useState<{ readonly side: Side; readonly id: number } | null>(null);
  const feedbackId = useRef(0);

  /** YouTube's gestures: double-tap a side to jump 10 s, the middle to toggle fullscreen. */
  const onDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const x = (event.clientX - rect.left) / rect.width;
    if (x >= 1 / 3 && x <= 2 / 3) {
      onToggleImmersive?.();
      return;
    }
    if (!canSeek || !hasVideo || onSeekBy === undefined) {
      return;
    }
    const side: Side = x < 1 / 3 ? 'left' : 'right';
    onSeekBy(side === 'left' ? -SEEK_STEP_LONG_S : SEEK_STEP_LONG_S);
    feedbackId.current += 1;
    setFeedback({ side, id: feedbackId.current });
  };

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-black',
        immersive ? 'min-h-0 flex-1' : 'border-foreground aspect-video border-2',
      )}
      data-testid="player"
      data-sync-status={sync.unavailable ? 'unavailable' : status}
      data-player-state={sync.playerState}
      data-drift-ms={sync.driftMs ?? ''}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {/* Swallows clicks so the embedded player's own UI can never change playback. Gestures are
          a convenience on top; buttons and keys remain the accessible way to do the same. */}
      <div
        className="absolute inset-0 touch-manipulation"
        aria-hidden
        data-testid="gesture-layer"
        onDoubleClick={onDoubleClick}
      />
      {feedback !== null && (
        <motion.div
          key={feedback.id}
          data-testid="seek-feedback"
          aria-hidden
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: SEEK_FEEDBACK_MS / 1000 }}
          onAnimationComplete={() => {
            setFeedback((current) => (current?.id === feedback.id ? null : current));
          }}
          className={cn(
            'bg-primary text-primary-foreground pointer-events-none absolute top-1/2 -translate-y-1/2 px-3 py-2 font-mono text-sm font-bold',
            feedback.side === 'left' ? 'left-[12%]' : 'right-[12%]',
          )}
        >
          {feedback.side === 'left' ? `−${String(SEEK_STEP_LONG_S)} s` : `+${String(SEEK_STEP_LONG_S)} s`}
        </motion.div>
      )}
      <ReactionOverlay />

      {!hasVideo && (
        <div className="bg-background absolute inset-0 grid place-items-center">
          <div className="grid justify-items-center gap-2 px-6 text-center">
            <Film className="text-muted-foreground size-10" />
            <p className="font-display text-3xl font-semibold italic">Nothing playing yet</p>
            <p className="text-muted-foreground text-sm">
              {canControl
                ? 'Paste a YouTube link below to start the party.'
                : 'Waiting for the host to pick a video.'}
            </p>
          </div>
        </div>
      )}

      {hasVideo && (status === 'loading' || status === 'buffering') && (
        <div
          role="status"
          className="neo-eyebrow absolute top-3 left-3 flex items-center gap-2 bg-black px-2 py-1 text-white"
        >
          <Loader2 className="size-3.5 animate-spin" />
          {status === 'loading' ? 'Syncing…' : 'Buffering…'}
        </div>
      )}

      {hasVideo && sync.rateUnsupported && (
        <div
          role="status"
          className="neo-eyebrow absolute top-3 right-3 flex items-center gap-2 bg-black px-2 py-1 text-white"
        >
          <Gauge className="size-3.5" />
          This video can't play at {formatRate(roomRate)} on your device
        </div>
      )}

      {status === 'muted' && (
        <Button
          size="sm"
          variant="secondary"
          // In fullscreen the control bar covers the bottom edge, so it moves to the top.
          className={cn('absolute left-3', immersive ? 'top-12' : 'bottom-3')}
          onClick={sync.resume}
        >
          <VolumeX /> Tap to unmute
        </Button>
      )}

      {status === 'blocked' && (
        <button
          type="button"
          onClick={sync.resume}
          className="absolute inset-0 grid place-items-center bg-black/75 text-white"
        >
          <span className="grid justify-items-center gap-3">
            <span className="bg-primary text-primary-foreground grid size-16 place-items-center">
              <Play className="size-8" />
            </span>
            <span className="font-medium">Click to join playback</span>
          </span>
        </button>
      )}

      {sync.unavailable && (
        <div
          role="alert"
          className="absolute inset-0 grid place-items-center bg-black/85 px-6 text-center text-white"
        >
          <div className="grid justify-items-center gap-3">
            <WifiOff className="size-10" />
            <p className="font-medium">Couldn't load the YouTube player</p>
            <p className="text-sm text-white/70">
              Check your connection. It reloads by itself when you're back online.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                window.location.reload();
              }}
            >
              <RefreshCw /> Reload player
            </Button>
          </div>
        </div>
      )}

      {isPlaybackError(status) && (
        <div
          role="alert"
          className="absolute inset-0 grid place-items-center bg-black/80 px-6 text-center text-white"
        >
          <div className="grid justify-items-center gap-2">
            <MonitorX className="size-10" />
            <p className="font-medium">This video can't be played here</p>
            <p className="text-sm text-white/70">
              {PLAYBACK_ERROR_REASON[status]}{' '}
              {status === 'player_rejected'
                ? 'Try reloading the page.'
                : canControl
                  ? 'Pick another video.'
                  : 'The host can pick another video.'}
            </p>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
