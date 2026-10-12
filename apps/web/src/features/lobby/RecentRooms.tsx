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
      <h2 id="recent-rooms" className="neo-eyebrow text-muted-foreground font-sans">
        Recent rooms
      </h2>
      <ul className="bg-card divide-foreground border-foreground divide-y-2 border-2">
        {rooms.map((room) => (
          <li key={room.roomId}>
            <Link
              to={`/r/${room.roomId}`}
              className="hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground group flex items-center gap-3 px-4 py-3 outline-none"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{room.name}</p>
                <p className="text-muted-foreground group-hover:text-primary-foreground group-focus-visible:text-primary-foreground text-xs">
                  <span className="font-mono">{room.roomId}</span> · {timeAgo(room.lastJoinedAt, now)}
                </p>
              </div>
              <Badge variant="secondary">{roleLabel(room.lastRole)}</Badge>
              <ChevronRight className="size-4" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
