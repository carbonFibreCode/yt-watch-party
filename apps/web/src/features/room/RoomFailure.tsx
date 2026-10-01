import { Ban, RefreshCw, TriangleAlert, UsersRound } from 'lucide-react';
import type { ReactElement } from 'react';
import { MessagePage } from '@/app/MessagePage';
import { Button } from '@/components/ui/button';
import type { ErrorCode } from '@watchparty/shared';
import { ERROR_MESSAGES } from '@watchparty/shared';

const TITLES: Partial<Record<ErrorCode, string>> = {
  BANNED: "You can't rejoin this room",
  ROOM_FULL: 'This room is full',
  ROOM_NOT_FOUND: "This room doesn't exist",
  UNAUTHENTICATED: 'Your session expired',
};

/** Why the room could not be joined, with the one action that makes sense. */
export function RoomFailure({ code }: { readonly code: ErrorCode }): ReactElement {
  const icon =
    code === 'BANNED' ? (
      <Ban className="size-6" />
    ) : code === 'ROOM_FULL' ? (
      <UsersRound className="size-6" />
    ) : (
      <TriangleAlert className="size-6" />
    );
  const retryable = code !== 'BANNED' && code !== 'ROOM_NOT_FOUND';
  return (
    <MessagePage
      icon={icon}
      title={TITLES[code] ?? "Couldn't join the room"}
      description={ERROR_MESSAGES[code]}
      {...(retryable
        ? {
            action: (
              <Button
                onClick={() => {
                  window.location.reload();
                }}
              >
                <RefreshCw /> Try again
              </Button>
            ),
          }
        : {})}
    />
  );
}
