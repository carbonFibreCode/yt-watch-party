import { Film, Loader2, MonitorX, Play, VolumeX } from 'lucide-react';
import type { ReactElement, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { useRoom } from '@/features/room/RoomContext';
import type { PlayerSync } from './usePlayerSync';

interface PlayerSurfaceProps {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly sync: PlayerSync;
  readonly canControl: boolean;
}

/**
 * The video area: the YouTube iframe under an input-blocking layer (native controls must never
 * produce intents, LLD SP-13), plus every playback state the viewer needs to know about.
 */
export function PlayerSurface({ containerRef, sync, canControl }: PlayerSurfaceProps): ReactElement {
  const hasVideo = useRoom((s) => s.playback !== null && s.playback.videoId !== null);
  const { status } = sync;

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-xl bg-black"
      data-testid="player"
      data-sync-status={status}
      data-player-state={sync.playerState}
      data-drift-ms={sync.driftMs ?? ''}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {/* Swallows clicks so the embedded player's own UI can never change playback. */}
      <div className="absolute inset-0" aria-hidden />

      {!hasVideo && (
        <div className="bg-muted/40 absolute inset-0 grid place-items-center">
          <div className="grid justify-items-center gap-2 px-6 text-center">
            <Film className="text-muted-foreground size-10" />
            <p className="font-medium">Nothing playing yet</p>
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
          className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs text-white"
        >
          <Loader2 className="size-3.5 animate-spin" />
          {status === 'loading' ? 'Syncing…' : 'Buffering…'}
        </div>
      )}

      {status === 'muted' && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute bottom-3 left-3 shadow-lg"
          onClick={sync.resume}
        >
          <VolumeX /> Tap to unmute
        </Button>
      )}

      {status === 'blocked' && (
        <button
          type="button"
          onClick={sync.resume}
          className="absolute inset-0 grid place-items-center bg-black/60 text-white"
        >
          <span className="grid justify-items-center gap-3">
            <span className="bg-primary text-primary-foreground grid size-16 place-items-center rounded-full">
              <Play className="size-8" />
            </span>
            <span className="font-medium">Click to join playback</span>
          </span>
        </button>
      )}

      {status === 'embed_error' && (
        <div
          role="alert"
          className="absolute inset-0 grid place-items-center bg-black/80 px-6 text-center text-white"
        >
          <div className="grid justify-items-center gap-2">
            <MonitorX className="size-10" />
            <p className="font-medium">This video can't be played here</p>
            <p className="text-sm text-white/70">
              Its owner doesn't allow embedding.{' '}
              {canControl ? 'Pick another video.' : 'The host can pick another video.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
