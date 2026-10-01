import { Check, Copy, LogOut, WifiOff } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { AppHeader } from '@/app/AppHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRoom, useRpc } from './RoomContext';

const COPIED_FEEDBACK_MS = 2_000;

/** Room name, invite code/link, connection state and leave. */
export function RoomHeader(): ReactElement {
  const navigate = useNavigate();
  const rpc = useRpc();
  const roomId = useRoom((s) => s.roomId);
  const name = useRoom((s) => s.name);
  const reconnecting = useRoom((s) => s.connection === 'reconnecting');
  const [copied, setCopied] = useState(false);

  const copyLink = async (): Promise<void> => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, COPIED_FEEDBACK_MS);
  };

  const leave = async (): Promise<void> => {
    if (roomId !== null) {
      await rpc('leave_room', { roomId }).catch(() => undefined);
    }
    await navigate('/');
  };

  return (
    <AppHeader>
      <h1 className="min-w-0 truncate font-semibold">{name}</h1>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="font-mono tracking-widest"
            onClick={() => void copyLink()}
          >
            {roomId}
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Invite link copied' : 'Copy invite link'}</TooltipContent>
      </Tooltip>
      {reconnecting && (
        <Badge variant="destructive" className="gap-1" role="status">
          <WifiOff className="size-3" /> Reconnecting…
        </Badge>
      )}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void leave()}>
        <LogOut /> <span className="hidden sm:inline">Leave</span>
      </Button>
    </AppHeader>
  );
}
