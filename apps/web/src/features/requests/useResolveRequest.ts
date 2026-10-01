import { useCallback } from 'react';
import { useRpc } from '@/features/room/RoomContext';

/** Approve or reject a participant's request; shared by the requests panel and the toasts. */
export const useResolveRequest = (): ((requestId: string, approve: boolean) => void) => {
  const rpc = useRpc();
  return useCallback(
    (requestId, approve) => {
      rpc('resolve_request', { requestId, approve }).catch(() => undefined);
    },
    [rpc],
  );
};
