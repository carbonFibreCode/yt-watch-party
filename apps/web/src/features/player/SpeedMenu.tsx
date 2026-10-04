import { Gauge } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PLAYBACK_RATES } from '@watchparty/shared';
import { ControlHint } from './ControlHint';
import { hintFor } from './controlHints';
import type { PlaybackCommand } from './usePlaybackCommand';

interface SpeedMenuProps {
  readonly command: PlaybackCommand;
  /** The room's current speed. */
  readonly rate: number;
  readonly hasVideo: boolean;
  /** Styling for the fullscreen overlay bar. */
  readonly overlay?: boolean;
  /** An open menu keeps the fullscreen controls from auto-hiding. */
  readonly onOpenChange?: (open: boolean) => void;
}

/**
 * Playback speed for the whole room (plan §15.6 Step 3.7). Staff change it directly, participants
 * ask for it (the host approves), viewers see it but cannot change it.
 */
export function SpeedMenu({
  command,
  rate,
  hasVideo,
  overlay = false,
  onOpenChange,
}: SpeedMenuProps): ReactElement {
  const { mode, send } = command;
  const label = `Playback speed: ${formatRate(rate)}`;
  return (
    <DropdownMenu {...(onOpenChange === undefined ? {} : { onOpenChange })}>
      <ControlHint hint={hintFor(mode, 'Playback speed (< >)', 'Ask to change the speed')}>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            disabled={!hasVideo || mode === 'none'}
            aria-label={label}
            className={cn(
              'gap-1 px-2 tabular-nums',
              overlay && 'text-white hover:bg-white/15 hover:text-white',
            )}
          >
            <Gauge />
            <span aria-hidden>{rate === 1 ? '1×' : formatRate(rate)}</span>
          </Button>
        </DropdownMenuTrigger>
      </ControlHint>
      <DropdownMenuContent align="end" className="z-50">
        <DropdownMenuLabel>
          {mode === 'request' ? 'Ask the host for a speed' : 'Speed for everyone'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={String(rate)}
          onValueChange={(value) => {
            const next = PLAYBACK_RATES.find((option) => String(option) === value);
            if (next !== undefined && next !== rate) {
              void send({ type: 'set_rate', rate: next });
            }
          }}
        >
          {PLAYBACK_RATES.map((option) => (
            <DropdownMenuRadioItem key={option} value={String(option)}>
              {formatRate(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
