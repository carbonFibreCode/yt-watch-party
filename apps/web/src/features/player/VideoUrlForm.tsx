import { Hand, Link2 } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement, SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseYouTubeId, VIDEO_URL_MAX_LEN } from '@watchparty/shared';
import { ControlHint } from './ControlHint';
import { hintFor } from './controlHints';
import type { PlaybackCommand } from './usePlaybackCommand';

/** Paste a YouTube link to change the video (or ask for it). */
export function VideoUrlForm({ command }: { readonly command: PlaybackCommand }): ReactElement | null {
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
    if (await send({ type: 'change_video', url })) {
      setUrl('');
    }
    setPending(false);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex gap-2">
      <div className="relative flex-1">
        <Link2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          aria-label="YouTube link"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
          }}
          placeholder="Paste a YouTube link"
          maxLength={VIDEO_URL_MAX_LEN}
          inputMode="url"
          className="pl-9"
        />
      </div>
      <ControlHint hint={hintFor(mode, 'Play this video for everyone', 'Ask the host to play this video')}>
        <Button
          type="submit"
          disabled={!valid || pending}
          variant={mode === 'request' ? 'secondary' : 'default'}
        >
          {mode === 'request' ? (
            <>
              <Hand /> Request video
            </>
          ) : (
            'Play now'
          )}
        </Button>
      </ControlHint>
    </form>
  );
}
