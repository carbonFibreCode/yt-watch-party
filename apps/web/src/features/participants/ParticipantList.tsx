import type { ReactElement } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRoom } from '@/features/room/RoomContext';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ParticipantView } from '@watchparty/shared';
import { ROLE_RANK } from '@watchparty/shared';
import { RoleBadge } from './RoleBadge';

const byRankThenJoin = (a: ParticipantView, b: ParticipantView): number =>
  ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.joinedAt - b.joinedAt;

/** Everyone in the room with their role and presence. */
export function ParticipantList(): ReactElement {
  const participants = useRoom((s) => s.participants);
  const selfId = useRoom((s) => s.selfId);
  const sorted = [...participants].sort(byRankThenJoin);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          People <span className="text-muted-foreground font-normal">· {participants.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-1">
          {sorted.map((p) => {
            const away = p.presence === 'away';
            return (
              <li key={p.userId} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                <div className="relative">
                  <Avatar className={cn('size-8', away && 'opacity-50')}>
                    <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      'ring-card absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2',
                      away ? 'bg-muted-foreground' : 'bg-success',
                    )}
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {p.name}
                    {p.userId === selfId && <span className="text-muted-foreground font-normal"> (you)</span>}
                  </p>
                  {away && <p className="text-muted-foreground text-xs">Reconnecting…</p>}
                </div>
                <RoleBadge role={p.role} />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
