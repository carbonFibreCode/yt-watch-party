import { DoorOpen } from 'lucide-react';
import type { ReactElement } from 'react';
import { MessagePage } from './MessagePage';

/** Where a removed participant lands (LLD SP-8 `kicked`). */
export function RemovedPage(): ReactElement {
  return (
    <MessagePage
      icon={<DoorOpen className="size-6" />}
      title="You were removed from the room"
      description="The host or a moderator removed you, so you can't rejoin this room. You can still start or join another one."
    />
  );
}
