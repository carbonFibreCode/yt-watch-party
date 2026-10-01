import type { ReactElement } from 'react';
import { Navigate } from 'react-router';
import type { RoomCode } from '@watchparty/shared';
import { RoomContext, useRoom } from './RoomContext';
import { RoomFailure } from './RoomFailure';
import { RoomScreen } from './RoomScreen';
import { RoomSkeleton } from './RoomSkeleton';
import { useRoomConnection } from './useRoomConnection';

/** One live connection to a room, and the screen for each of its states. */
export function RoomSession({ roomId }: { readonly roomId: RoomCode }): ReactElement {
  const connection = useRoomConnection(roomId);
  return (
    <RoomContext.Provider value={connection}>
      <RoomStatusSwitch />
    </RoomContext.Provider>
  );
}

function RoomStatusSwitch(): ReactElement {
  const status = useRoom((s) => s.status);
  const failure = useRoom((s) => s.failure);
  switch (status) {
    case 'connecting':
      return <RoomSkeleton />;
    case 'failed':
      return <RoomFailure code={failure ?? 'INTERNAL'} />;
    case 'kicked':
      return <Navigate to="/removed" replace />;
    case 'joined':
      return <RoomScreen />;
  }
}
