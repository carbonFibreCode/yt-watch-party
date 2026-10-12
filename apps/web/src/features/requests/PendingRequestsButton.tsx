import { Hand } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ControlHint } from '@/features/player/ControlHint';
import { cn } from '@/lib/utils';
import { RequestsPanel } from './RequestsPanel';
import { usePendingRequestsForStaff } from './usePendingRequestsForStaff';

/**
 * Fullscreen fallback for approvals (plan §15.4 Step 1.13a): if a request toast was missed or
 * swiped away, staff can still approve without leaving fullscreen. The dialog portals to <body>,
 * above the fullscreen player.
 */
export function PendingRequestsButton({ className }: { readonly className?: string }): ReactElement | null {
  const count = usePendingRequestsForStaff();
  const [open, setOpen] = useState(false);
  if (count === 0 && !open) {
    return null;
  }
  const label = `Pending requests (${String(count)})`;
  return (
    <>
      <ControlHint hint={label}>
        <Button
          size="sm"
          variant="secondary"
          aria-label={label}
          className={cn('gap-1.5', className)}
          onClick={() => {
            setOpen(true);
          }}
        >
          <Hand />
          <span className="tabular-nums" aria-hidden>
            {count}
          </span>
        </Button>
      </ControlHint>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader>
            <DialogTitle>Pending requests</DialogTitle>
            <DialogDescription>Approve or reject without leaving full screen.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pr-1.5 pb-1.5">
            <RequestsPanel />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
