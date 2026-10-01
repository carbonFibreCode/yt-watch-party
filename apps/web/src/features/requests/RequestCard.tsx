import { Check, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import type { RequestView } from '@watchparty/shared';
import { describeAction } from './describeAction';
import { useResolveRequest } from './useResolveRequest';
import { useSecondsLeft } from './useSecondsLeft';

/** One pending request with a live countdown and approve/reject. */
export function RequestCard({ request }: { readonly request: RequestView }): ReactElement {
  const resolve = useResolveRequest();
  const secondsLeft = useSecondsLeft(request.expiresAt);
  const { action } = request;
  const video = action.type === 'change_video' || action.type === 'queue_add' ? action.video : null;

  return (
    <li className="bg-muted/40 grid gap-3 rounded-lg border p-3" data-testid="request-card">
      <div className="flex gap-3">
        {video !== null && (
          <img
            src={video.thumbnailUrl}
            alt=""
            className="bg-muted aspect-video h-10 shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1 text-sm">
          <p>
            <span className="font-medium">{request.requester.name}</span> wants to {describeAction(action)}
          </p>
          <p className="text-muted-foreground text-xs" aria-live="off">
            Expires in {secondsLeft}s
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => {
            resolve(request.id, true);
          }}
        >
          <Check /> Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => {
            resolve(request.id, false);
          }}
        >
          <X /> Reject
        </Button>
      </div>
    </li>
  );
}
