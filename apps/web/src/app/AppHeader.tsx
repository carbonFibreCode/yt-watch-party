import { Clapperboard } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { UserMenu } from '@/features/auth/UserMenu';

interface AppHeaderProps {
  /** Page-specific content between the brand and the account menu. */
  readonly children?: ReactNode;
}

export function AppHeader({ children }: AppHeaderProps): ReactElement {
  return (
    <header className="bg-background border-foreground sticky top-0 z-40 border-b-2">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Watch Party home">
          <span className="bg-primary text-primary-foreground grid size-8 place-items-center">
            <Clapperboard className="size-4.5" />
          </span>
          <span className="font-display hidden text-lg leading-none font-bold tracking-tight sm:inline">
            watch<span className="italic">party</span>
          </span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
        <UserMenu />
      </div>
    </header>
  );
}
