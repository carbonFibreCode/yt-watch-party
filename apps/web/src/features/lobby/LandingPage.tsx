import type { ReactElement } from 'react';
import { AppHeader } from '@/app/AppHeader';
import { CreateRoomForm } from './CreateRoomForm';
import { JoinRoomForm } from './JoinRoomForm';
import { RecentRooms } from './RecentRooms';

const FEATURES = ['Frame-perfect sync', 'Host controls', 'Ask to change', 'Chat & reactions'] as const;

export function LandingPage(): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-12 px-4 py-12 sm:py-20">
        <section className="grid gap-6">
          <p className="neo-eyebrow text-muted-foreground">YouTube watch parties</p>
          <h1 className="text-5xl leading-[0.95] font-semibold tracking-tight text-balance sm:text-7xl">
            Watch it{' '}
            <span className="bg-primary text-primary-foreground px-2 italic [box-decoration-break:clone]">
              together
            </span>
            , in perfect sync.
          </h1>
          <p className="text-muted-foreground max-w-2xl text-lg text-balance">
            Start a room, share the link, and everyone sees the same moment. Hosts and moderators keep
            control; everyone else can ask for a change.
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Features">
            {FEATURES.map((feature) => (
              <li key={feature} className="neo-eyebrow border-foreground border-2 px-2 py-1">
                {feature}
              </li>
            ))}
          </ul>
        </section>
        {/* Extra right/bottom padding leaves room for the cards' 3D edges. */}
        <section className="grid gap-8 pr-1.5 pb-1.5 md:grid-cols-[3fr_2fr]">
          <CreateRoomForm />
          <JoinRoomForm />
        </section>
        <RecentRooms />
      </main>
    </div>
  );
}
