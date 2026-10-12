import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { AppHeader } from './AppHeader';

interface MessagePageProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}

/** Full-page message used for "not found", "removed" and failure screens. */
export function MessagePage({ icon, title, description, action }: MessagePageProps): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="grid flex-1 place-items-center px-4">
        <div className="grid max-w-md justify-items-center gap-4 text-center">
          <div className="bg-primary text-primary-foreground grid size-16 place-items-center">{icon}</div>
          <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
          {action ?? (
            <Button asChild>
              <Link to="/">Back to home</Link>
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
