import { Inbox } from 'lucide-react';
import type { ReactElement } from 'react';
import { useRoom } from '@/features/room/RoomContext';
import { RequestCard } from './RequestCard';

/** Pending participant requests for the host and moderators (LLD SP-10). */
export function RequestsPanel(): ReactElement {
  const requests = useRoom((s) => s.requests);
  if (requests.length === 0) {
    return (
      <div className="text-muted-foreground grid justify-items-center gap-2 py-8 text-center text-sm">
        <Inbox className="size-8" />
        <p>No pending requests.</p>
        <p className="text-xs">When participants ask to change playback, it shows up here.</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-2" aria-label="Pending requests">
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
    </ul>
  );
}
