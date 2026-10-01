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
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold" aria-label="Watch Party home">
          <Clapperboard className="text-primary size-5" />
          <span className="hidden sm:inline">Watch Party</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
        <UserMenu />
      </div>
    </header>
  );
}
