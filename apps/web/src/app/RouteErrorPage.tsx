import { TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';
import { MessagePage } from './MessagePage';

/** Last-resort boundary for render errors. */
export function RouteErrorPage(): ReactElement {
  return (
    <MessagePage
      icon={<TriangleAlert className="size-6" />}
      title="Something went wrong"
      description="An unexpected error occurred. Reloading the page usually fixes it."
    />
  );
}
