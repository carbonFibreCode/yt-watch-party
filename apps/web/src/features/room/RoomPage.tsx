import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { NotFoundPage } from '@/app/NotFoundPage';
import { hasChosenName } from '@/features/auth/identity';
import { ApiError, api } from '@/lib/api';
import { authClient } from '@/lib/authClient';
import { queryKeys } from '@/lib/queryKeys';
import type { RoomCode as RoomCodeType } from '@watchparty/shared';
import { RoomCode } from '@watchparty/shared';
import { GuestJoinCard } from './GuestJoinCard';
import { RoomFailure } from './RoomFailure';
import { RoomSession } from './RoomSession';
import { RoomSkeleton } from './RoomSkeleton';

/** `/r/:code`: validate the code, preview the room, make sure we have a name, then connect. */
export function RoomPage(): ReactElement {
  const parsed = RoomCode.safeParse(useParams().code ?? '');
  if (!parsed.success) {
    return (
      <NotFoundPage title="That room code isn't valid" description="Room codes are 6 letters and numbers." />
    );
  }
  return <RoomGate roomId={parsed.data} />;
}

function RoomGate({ roomId }: { readonly roomId: RoomCodeType }): ReactElement {
  const session = authClient.useSession();
  const preview = useQuery({
    queryKey: queryKeys.roomPreview(roomId),
    queryFn: () => api.roomPreview(roomId),
  });

  if (preview.isPending || session.isPending) {
    return <RoomSkeleton />;
  }
  if (preview.isError) {
    return preview.error instanceof ApiError && preview.error.code === 'ROOM_NOT_FOUND' ? (
      <NotFoundPage
        title="This room doesn't exist"
        description="Check the code or ask for a fresh invite link."
      />
    ) : (
      <RoomFailure code="INTERNAL" />
    );
  }
  if (!hasChosenName(session.data)) {
    return <GuestJoinCard preview={preview.data} />;
  }
  // Keyed by identity: switching accounts reconnects as the new user.
  return <RoomSession key={session.data.user.id} roomId={roomId} />;
}
