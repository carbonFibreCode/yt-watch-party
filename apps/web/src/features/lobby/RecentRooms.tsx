import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { authClient } from '@/lib/authClient';
import { roleLabel, timeAgo } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';

/** Rooms you created or joined recently; hidden until there is something to show. */
export function RecentRooms(): ReactElement | null {
  const { data: session } = authClient.useSession();
  const [now] = useState(() => Date.now());
  const { data: rooms } = useQuery({
    queryKey: queryKeys.myRooms(session?.user.id),
    queryFn: api.myRooms,
    enabled: session !== null,
  });

  if (rooms === undefined || rooms.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="recent-rooms" className="grid gap-3">
      <h2 id="recent-rooms" className="text-muted-foreground text-sm font-medium">
        Recent rooms
      </h2>
      <ul className="divide-border bg-card divide-y rounded-xl border">
        {rooms.map((room) => (
          <li key={room.roomId}>
            <Link
              to={`/r/${room.roomId}`}
              className="hover:bg-accent/50 focus-visible:bg-accent/50 flex items-center gap-3 px-4 py-3 outline-none first:rounded-t-xl last:rounded-b-xl"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{room.name}</p>
                <p className="text-muted-foreground text-xs">
                  <span className="font-mono">{room.roomId}</span> · {timeAgo(room.lastJoinedAt, now)}
                </p>
              </div>
              <Badge variant="secondary">{roleLabel(room.lastRole)}</Badge>
              <ChevronRight className="text-muted-foreground size-4" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
