import { Hand, ListPlus, Play, X } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement, SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePlaybackCommand } from '@/features/player/usePlaybackCommand';
import type { PlaybackCommand } from '@/features/player/usePlaybackCommand';
import { useRoom, useRpc } from '@/features/room/RoomContext';
import type { QueueItemView } from '@watchparty/shared';
import { parseYouTubeId, VIDEO_URL_MAX_LEN, youtubeWatchUrl } from '@watchparty/shared';

/** Add a link to the queue directly (staff) or ask for it (participants). */
function AddToQueueForm({ command }: { readonly command: PlaybackCommand }): ReactElement | null {
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);
  const { mode, send } = command;
  const valid = parseYouTubeId(url) !== null;
  if (mode === 'none') {
    return null;
  }

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    setPending(true);
    if (await send({ type: 'queue_add', url })) {
      setUrl('');
    }
    setPending(false);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex gap-2">
      <Input
        aria-label="Link to queue"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
        }}
        placeholder="Queue a YouTube link"
        maxLength={VIDEO_URL_MAX_LEN}
        inputMode="url"
      />
      <Button
        type="submit"
        variant={mode === 'request' ? 'secondary' : 'default'}
        disabled={!valid || pending}
      >
        {mode === 'request' ? <Hand /> : <ListPlus />}
        {mode === 'request' ? 'Ask to queue' : 'Add to queue'}
      </Button>
    </form>
  );
}

function QueueRow({
  item,
  index,
  manage,
}: {
  readonly item: QueueItemView;
  readonly index: number;
  readonly manage: { readonly playNow: () => void; readonly remove: () => void } | null;
}): ReactElement {
  return (
    <li className="flex items-center gap-2 rounded-lg p-1.5">
      <span className="text-muted-foreground w-4 shrink-0 text-right text-xs tabular-nums">{index + 1}</span>
      <img
        src={item.video.thumbnailUrl}
        alt=""
        className="bg-muted aspect-video h-9 shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.video.title}>
          {item.video.title}
        </p>
        <p className="text-muted-foreground truncate text-xs">Added by {item.addedBy.name}</p>
      </div>
      {manage !== null && (
        <>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Play ${item.video.title} now`}
            onClick={manage.playNow}
          >
            <Play />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove ${item.video.title}`}
            onClick={manage.remove}
          >
            <X />
          </Button>
        </>
      )}
    </li>
  );
}

/** Up next: plays automatically when the current video ends (LLD SP-15). Staff can reorder by playing now or removing. */
export function QueuePanel(): ReactElement {
  const queue = useRoom((s) => s.queue);
  const command = usePlaybackCommand();
  const rpc = useRpc();
  const staff = command.mode === 'direct';

  const remove = (item: QueueItemView): Promise<void> =>
    rpc('queue_remove', { itemId: item.id }).then(
      () => undefined,
      () => undefined,
    );
  const playNow = async (item: QueueItemView): Promise<void> => {
    if (await command.send({ type: 'change_video', url: youtubeWatchUrl(item.video.id) })) {
      await remove(item);
    }
  };

  return (
    <div className="grid gap-3">
      <AddToQueueForm command={command} />
      {queue.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          The queue is empty. Queued videos play when the current one ends.
        </p>
      ) : (
        <ol aria-label="Queue" className="grid gap-1">
          {queue.map((item, index) => (
            <QueueRow
              key={item.id}
              item={item}
              index={index}
              manage={
                staff
                  ? {
                      playNow: () => void playNow(item),
                      remove: () => void remove(item),
                    }
                  : null
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}
