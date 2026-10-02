import type { ReactElement } from 'react';
import { PlayerColumn } from '@/features/player/PlayerColumn';
import { useRequestToasts } from '@/features/requests/useRequestToasts';
import { RoomHeader } from './RoomHeader';
import { RoomSidebar } from './RoomSidebar';

/** The joined room: header, player and sidebar. */
export function RoomScreen(): ReactElement {
  useRequestToasts();
  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader />
      <main className="mx-auto grid w-full max-w-[1600px] flex-1 content-start gap-4 p-4 lg:grid-cols-[1fr_380px]">
        <section aria-label="Player" className="min-w-0">
          <PlayerColumn />
        </section>
        {/* Wide screens: sticky under the header and exactly as tall as the rest of the viewport
            (header 3.5rem + page padding 2rem), so chat uses the full column. */}
        <aside
          aria-label="Room sidebar"
          className="grid content-start gap-4 lg:sticky lg:top-18 lg:flex lg:h-[calc(100dvh-5.5rem)] lg:flex-col"
        >
          <RoomSidebar />
        </aside>
      </main>
    </div>
  );
}
