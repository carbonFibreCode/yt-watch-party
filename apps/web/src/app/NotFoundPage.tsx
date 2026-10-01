import { SearchX } from 'lucide-react';
import type { ReactElement } from 'react';
import { MessagePage } from './MessagePage';

interface NotFoundPageProps {
  readonly title?: string;
  readonly description?: string;
}

export function NotFoundPage({
  title = 'Page not found',
  description = "We couldn't find what you were looking for.",
}: NotFoundPageProps): ReactElement {
  return <MessagePage icon={<SearchX className="size-6" />} title={title} description={description} />;
}
