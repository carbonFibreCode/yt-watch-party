import { Hand, Pause, Play } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useRoom } from '@/features/room/RoomContext';
import { formatDuration } from '@/lib/format';
import { ControlHint } from './ControlHint';
import { hintFor } from './controlHints';
import type { PlaybackCommand } from './usePlaybackCommand';
import { usePlaybackPosition } from './usePlaybackPosition';

interface ControlBarProps {
  readonly command: PlaybackCommand;
  /** Video length in seconds, once known. */
  readonly duration: number | null;
}

/** Play/pause, time and scrubber. Every control routes through the role-aware PlaybackCommand. */
export function ControlBar({ command, duration }: ControlBarProps): ReactElement {
  const playState = useRoom((s) => s.playback?.playState ?? 'idle');
  const position = usePlaybackPosition();
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const { mode, send } = command;
  const hasVideo = playState !== 'idle';
  const playing = playState === 'playing';
  const disabled = !hasVideo || mode === 'none';
  const shown = scrubbing ?? position;
  const verb = playing ? 'Pause' : 'Play';

  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border px-3 py-2">
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
      <span className="text-muted-foreground w-28 shrink-0 text-center text-xs tabular-nums" aria-live="off">
        {formatDuration(shown)} / {duration === null ? '–:––' : formatDuration(duration)}
      </span>
      <Slider
        aria-label={mode === 'request' ? 'Ask to jump to a time' : 'Seek'}
        className="flex-1"
        min={0}
        max={Math.max(duration ?? 0, 1)}
        step={1}
        value={[Math.min(shown, duration ?? shown)]}
        disabled={disabled || duration === null}
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
  );
}
