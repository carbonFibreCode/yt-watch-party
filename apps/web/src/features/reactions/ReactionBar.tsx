import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { usePlaybackPosition } from '@/features/player/usePlaybackPosition';
import { useRoom, useRpc } from '@/features/room/RoomContext';
import type { ReactionEmoji } from '@watchparty/shared';
import { REACTION_SET } from '@watchparty/shared';

/** One-tap reactions, stamped with the moment of the video they were sent at (LLD SP-15). */
export function ReactionBar(): ReactElement {
  const rpc = useRpc();
  const hasVideo = useRoom((s) => s.playback !== null && s.playback.videoId !== null);
  const position = usePlaybackPosition();

  const react = (emoji: ReactionEmoji): void => {
    rpc('reaction', { emoji, videoTime: position }).catch(() => undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Reactions">
      {REACTION_SET.map((emoji) => (
        <Button
          key={emoji}
          variant="ghost"
          size="icon"
          className="text-lg"
          aria-label={`React with ${emoji}`}
          disabled={!hasVideo}
          onClick={() => {
            react(emoji);
          }}
        >
          {emoji}
        </Button>
      ))}
    </div>
  );
}
