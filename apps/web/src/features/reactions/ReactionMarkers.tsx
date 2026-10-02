import type { ReactElement } from 'react';
import { usePlaybackCommand } from '@/features/player/usePlaybackCommand';
import { useRoom } from '@/features/room/RoomContext';
import { formatDuration } from '@/lib/format';
import { reactionMoments } from './reactionMoments';

/** "Key moments": reaction clusters marked above the scrubber; staff can jump there. */
export function ReactionMarkers({ duration }: { readonly duration: number | null }): ReactElement | null {
  const reactions = useRoom((s) => s.reactions);
  const { mode, send } = usePlaybackCommand();
  if (duration === null || duration <= 0 || reactions.length === 0) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-5 h-5">
      {reactionMoments(reactions).map((moment) => {
        const label = `${moment.emoji} ×${String(moment.count)} at ${formatDuration(moment.time)}`;
        return (
          <button
            key={moment.time}
            type="button"
            title={mode === 'direct' ? `${label}: jump there` : label}
            aria-label={label}
            disabled={mode !== 'direct'}
            className="pointer-events-auto absolute -translate-x-1/2 text-sm leading-none transition-transform hover:scale-125 disabled:cursor-default"
            style={{ left: `${String(Math.min(100, (moment.time / duration) * 100))}%` }}
            onClick={() => void send({ type: 'seek', time: moment.time })}
          >
            {moment.emoji}
          </button>
        );
      })}
    </div>
  );
}
