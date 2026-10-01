import type { ReactElement } from 'react';
import { ParticipantList } from '@/features/participants/ParticipantList';
import { NowPlaying } from './NowPlaying';
import { RoomHeader } from './RoomHeader';

/** The joined room: header, main stage and sidebar. */
export function RoomScreen(): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader />
      <main className="mx-auto grid w-full max-w-[1600px] flex-1 content-start gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <section aria-label="Now playing" className="min-w-0">
          <NowPlaying />
        </section>
        <aside aria-label="Room sidebar" className="grid content-start gap-4">
          <ParticipantList />
        </aside>
      </main>
    </div>
  );
}
