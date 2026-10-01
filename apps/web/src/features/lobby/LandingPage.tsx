import type { ReactElement } from 'react';
import { AppHeader } from '@/app/AppHeader';
import { CreateRoomForm } from './CreateRoomForm';
import { JoinRoomForm } from './JoinRoomForm';
import { RecentRooms } from './RecentRooms';

export function LandingPage(): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-10 px-4 py-10 sm:py-16">
        <section className="grid gap-4 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Watch YouTube together, <span className="text-primary">perfectly in sync.</span>
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-balance">
            Start a room, share the link, and everyone sees the same moment. Hosts and moderators keep
            control; everyone else can ask for a change.
          </p>
        </section>
        <section className="grid gap-4 md:grid-cols-[3fr_2fr]">
          <CreateRoomForm />
          <JoinRoomForm />
        </section>
        <RecentRooms />
      </main>
    </div>
  );
}
