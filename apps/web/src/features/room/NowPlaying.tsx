import { Film } from 'lucide-react';
import type { ReactElement } from 'react';
import { Card } from '@/components/ui/card';
import { useRoom } from './RoomContext';
import { useCan } from './useCan';

/** What the room is watching. The synchronized player replaces the artwork in Phase 7. */
export function NowPlaying(): ReactElement {
  const video = useRoom((s) => s.playback?.video ?? null);
  const canControl = useCan('playback.control');

  if (video === null) {
    return (
      <Card className="bg-muted/40 grid aspect-video place-items-center border-dashed">
        <div className="grid justify-items-center gap-2 px-6 text-center">
          <Film className="text-muted-foreground size-10" />
          <p className="font-medium">Nothing playing yet</p>
          <p className="text-muted-foreground text-sm">
            {canControl
              ? 'Paste a YouTube link to start the party.'
              : 'Waiting for the host to pick a video.'}
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <img src={video.thumbnailUrl} alt="" className="bg-muted aspect-video w-full object-cover" />
      <p className="truncate px-4 py-3 font-medium">{video.title}</p>
    </Card>
  );
}
