import {
  Hand,
  Keyboard,
  Maximize,
  Minimize,
  Pause,
  Play,
  RectangleHorizontal,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useState } from 'react';
import type { PointerEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ReactionMarkers } from '@/features/reactions/ReactionMarkers';
import { PendingRequestsButton } from '@/features/requests/PendingRequestsButton';
import { useRoom } from '@/features/room/RoomContext';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ControlHint } from './ControlHint';
import { hintFor } from './controlHints';
import { SpeedMenu } from './SpeedMenu';
import type { PlaybackCommand } from './usePlaybackCommand';
import { usePlaybackPosition } from './usePlaybackPosition';

export interface AudioControls {
  readonly muted: boolean;
  readonly volume: number;
  readonly setMuted: (muted: boolean) => void;
  readonly setVolume: (volume: number) => void;
}

/** A view mode the viewer can switch on and off (fullscreen, theater). */
export interface ToggleControl {
  readonly active: boolean;
  readonly toggle: () => void;
}

interface ControlBarProps {
  readonly command: PlaybackCommand;
  /** Video length in seconds, once known. */
  readonly duration: number | null;
  readonly audio: AudioControls;
  readonly immersive: ToggleControl;
  readonly theater: ToggleControl;
  readonly onShowShortcuts: () => void;
  /** `overlay`: drawn over the video in fullscreen. */
  readonly variant: 'docked' | 'overlay';
  /** A menu in the bar opened or closed (keeps fullscreen controls from auto-hiding). */
  readonly onMenuOpenChange?: (open: boolean) => void;
}

const volumeIcon = (muted: boolean, volume: number): ReactElement =>
  muted || volume === 0 ? <VolumeX /> : volume < 50 ? <Volume1 /> : <Volume2 />;

/**
 * YouTube-style control bar (plan §15.4 Step 1.11): scrubber on top; play, audio, time and view
 * controls below. Playback controls route through the role-aware PlaybackCommand; audio and view
 * controls are this viewer's own and work for every role.
 */
export function ControlBar({
  command,
  duration,
  audio,
  immersive,
  theater,
  onShowShortcuts,
  variant,
  onMenuOpenChange,
}: ControlBarProps): ReactElement {
  const playState = useRoom((s) => s.playback?.playState ?? 'idle');
  const rate = useRoom((s) => s.playback?.playbackRate ?? 1);
  const position = usePlaybackPosition();
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [hover, setHover] = useState<{ readonly fraction: number; readonly time: number } | null>(null);
  const { mode, send } = command;
  const hasVideo = playState !== 'idle';
  const playing = playState === 'playing';
  const disabled = !hasVideo || mode === 'none';
  const shown = scrubbing ?? position;
  const verb = playing ? 'Pause' : 'Play';
  const overlay = variant === 'overlay';
  const iconButton = cn(overlay && 'text-white hover:bg-white/15 hover:text-white');

  const onScrubberPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== 'mouse' || duration === null || duration <= 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    setHover({ fraction, time: fraction * duration });
  };

  return (
    <div
      data-testid="control-bar"
      data-variant={variant}
      className={cn(
        'grid gap-1 px-3 pt-6 pb-2',
        overlay ? 'bg-gradient-to-t from-black/80 to-transparent text-white' : 'bg-card rounded-xl border',
      )}
    >
      <div
        className="relative"
        data-testid="scrubber"
        onPointerMove={onScrubberPointerMove}
        onPointerLeave={() => {
          setHover(null);
        }}
      >
        <ReactionMarkers duration={duration} />
        {hover !== null && (
          <span
            aria-hidden
            data-testid="scrubber-hover-time"
            className="bg-foreground text-background pointer-events-none absolute bottom-full mb-6 -translate-x-1/2 rounded-md px-2 py-1 text-xs tabular-nums"
            style={{ left: `${String(hover.fraction * 100)}%` }}
          >
            {formatDuration(hover.time)}
          </span>
        )}
        <Slider
          aria-label={mode === 'request' ? 'Ask to jump to a time' : 'Seek'}
          min={0}
          max={Math.max(duration ?? 0, 1)}
          step={1}
          // Until the length is known the track stays empty rather than looking finished.
          value={[duration === null ? 0 : Math.min(shown, duration)]}
          disabled={disabled || duration === null}
          valueText={(seconds) =>
            `${formatDuration(seconds)} of ${duration === null ? 'unknown length' : formatDuration(duration)}`
          }
          onValueChange={([value]) => {
            setScrubbing(value ?? null);
          }}
          onValueCommit={([value]) => {
            setScrubbing(null);
            if (value !== undefined) {
              void send({ type: 'seek', time: value });
            }
          }}
        />
      </div>

      <div className="flex min-w-0 items-center gap-1">
        <ControlHint hint={hintFor(mode, verb, `Ask to ${verb.toLowerCase()}`)}>
          <Button
            size="icon"
            variant={mode === 'request' ? 'secondary' : 'default'}
            disabled={disabled}
            aria-label={mode === 'request' ? `Ask to ${verb.toLowerCase()}` : verb}
            onClick={() => void send({ type: playing ? 'pause' : 'play' })}
          >
            {mode === 'request' ? <Hand /> : playing ? <Pause /> : <Play />}
          </Button>
        </ControlHint>

        <ControlHint hint={audio.muted ? 'Unmute (m)' : 'Mute (m)'}>
          <Button
            size="icon"
            variant="ghost"
            className={iconButton}
            aria-label={audio.muted ? 'Unmute' : 'Mute'}
            aria-pressed={audio.muted}
            onClick={() => {
              audio.setMuted(!audio.muted);
            }}
          >
            {volumeIcon(audio.muted, audio.volume)}
          </Button>
        </ControlHint>
        {/* iOS ignores page-set volume and phones have hardware buttons: no slider on touch. */}
        <div className="hidden w-20 shrink-0 items-center sm:flex pointer-coarse:hidden" data-testid="volume">
          <Slider
            aria-label="Volume"
            min={0}
            max={100}
            step={1}
            value={[audio.muted ? 0 : audio.volume]}
            valueText={(v) => `${String(v)}%`}
            onValueChange={([value]) => {
              if (value !== undefined) {
                audio.setVolume(value);
              }
            }}
          />
        </div>

        <span
          className={cn(
            'shrink-0 px-2 text-xs tabular-nums',
            overlay ? 'text-white/80' : 'text-muted-foreground',
          )}
          aria-live="off"
        >
          {formatDuration(shown)} / {duration === null ? '–:––' : formatDuration(duration)}
        </span>

        <div className="flex-1" />

        <SpeedMenu
          command={command}
          rate={rate}
          hasVideo={hasVideo}
          overlay={overlay}
          {...(onMenuOpenChange === undefined ? {} : { onOpenChange: onMenuOpenChange })}
        />
        {overlay && <PendingRequestsButton />}
        <ControlHint hint="Keyboard shortcuts (?)">
          <Button
            size="icon"
            variant="ghost"
            className={cn('hidden sm:inline-flex pointer-coarse:hidden', iconButton)}
            aria-label="Keyboard shortcuts"
            onClick={onShowShortcuts}
          >
            <Keyboard />
          </Button>
        </ControlHint>
        {!overlay && (
          // Only wide screens have a sidebar to make room from.
          <ControlHint hint={theater.active ? 'Default view (t)' : 'Theater mode (t)'}>
            <Button
              size="icon"
              variant="ghost"
              className="hidden lg:inline-flex"
              aria-label={theater.active ? 'Default view' : 'Theater mode'}
              aria-pressed={theater.active}
              onClick={theater.toggle}
            >
              <RectangleHorizontal />
            </Button>
          </ControlHint>
        )}
        <ControlHint hint={immersive.active ? 'Exit full screen (f)' : 'Full screen (f)'}>
          <Button
            size="icon"
            variant="ghost"
            className={iconButton}
            aria-label={immersive.active ? 'Exit full screen' : 'Full screen'}
            onClick={immersive.toggle}
          >
            {immersive.active ? <Minimize /> : <Maximize />}
          </Button>
        </ControlHint>
      </div>
    </div>
  );
}
