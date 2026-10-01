import type { ReactElement } from 'react';
import { AppHeader } from '@/app/AppHeader';
import { Skeleton } from '@/components/ui/skeleton';

/** Layout-shaped placeholder while the room preview loads or the socket joins. */
export function RoomSkeleton(): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true" aria-label="Loading room">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <div className="grid content-start gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </main>
    </div>
  );
}
