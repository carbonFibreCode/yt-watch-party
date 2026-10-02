import { SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRoom, useRpc } from '@/features/room/RoomContext';
import type { ChatEntry } from '@/features/room/store';
import { roleLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CHAT_MAX_LEN } from '@watchparty/shared';

/** Show the remaining-characters counter only near the limit. */
const COUNTER_FROM = Math.floor(CHAT_MAX_LEN * 0.8);
/** Within this distance of the bottom, new messages keep the list pinned to the bottom. */
const STICKY_BOTTOM_PX = 80;
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

function ChatLine({
  entry,
  selfId,
}: {
  readonly entry: ChatEntry;
  readonly selfId: string | null;
}): ReactElement {
  if (entry.kind === 'system') {
    return <li className="text-muted-foreground py-1 text-center text-xs">{entry.text}</li>;
  }
  const own = entry.user.userId === selfId;
  return (
    <li className={cn('rounded-lg px-2 py-1.5', own && 'bg-primary/10')}>
      <p className="flex items-baseline gap-2 text-xs">
        <span className="font-semibold">{own ? 'You' : entry.user.name}</span>
        {entry.user.role !== 'participant' && (
          <span className="text-muted-foreground">{roleLabel(entry.user.role)}</span>
        )}
        <time className="text-muted-foreground ml-auto" dateTime={new Date(entry.createdAt).toISOString()}>
          {timeFormat.format(entry.createdAt)}
        </time>
      </p>
      <p className="text-sm break-words whitespace-pre-wrap">{entry.text}</p>
    </li>
  );
}

/** Room chat with join/leave/role lines (LLD SP-15). Text is rendered as text, never HTML. */
export function ChatPanel(): ReactElement {
  const chat = useRoom((s) => s.chat);
  const selfId = useRoom((s) => s.selfId);
  const rpc = useRpc();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (list !== null && pinned.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [chat]);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const message = text.trim();
    if (message === '') {
      return;
    }
    setSending(true);
    pinned.current = true;
    try {
      await rpc('chat_message', { text: message });
      setText('');
    } catch {
      // Refusals (e.g. rate limited) are already shown by the RPC layer; keep the draft.
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-3">
      <ol
        ref={listRef}
        aria-label="Chat messages"
        aria-live="polite"
        className="grid max-h-96 min-h-48 content-start gap-1 overflow-y-auto pr-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_BOTTOM_PX;
        }}
      >
        {chat.length === 0 ? (
          <li className="text-muted-foreground py-10 text-center text-sm">No messages yet. Say hi!</li>
        ) : (
          chat.map((entry) => <ChatLine key={entry.id} entry={entry} selfId={selfId} />)
        )}
      </ol>
      <form onSubmit={(e) => void submit(e)} className="grid gap-1">
        <div className="flex gap-2">
          <Input
            aria-label="Message"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            placeholder="Send a message"
            maxLength={CHAT_MAX_LEN}
            autoComplete="off"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={sending || text.trim() === ''}
          >
            <SendHorizontal />
          </Button>
        </div>
        {text.length >= COUNTER_FROM && (
          <p className="text-muted-foreground text-right text-xs">
            {CHAT_MAX_LEN - text.length} characters left
          </p>
        )}
      </form>
    </div>
  );
}
