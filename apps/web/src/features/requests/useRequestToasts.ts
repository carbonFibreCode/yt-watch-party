import { useEffect } from 'react';
import { toast } from 'sonner';
import { useRoomStore } from '@/features/room/RoomContext';
import { selectSelf } from '@/features/room/store';
import { PermissionPolicy } from '@watchparty/shared';
import { describeAction } from './describeAction';
import { useResolveRequest } from './useResolveRequest';

/**
 * Staff get a toast with Approve/Reject for every new request; it disappears as soon as the
 * request is resolved by anyone or expires.
 */
export const useRequestToasts = (): void => {
  const store = useRoomStore();
  const resolve = useResolveRequest();

  useEffect(() => {
    const shown = new Set<string>();
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.requests === previous.requests) {
        return;
      }
      const self = selectSelf(state);
      const staff = self !== undefined && PermissionPolicy.isStaff(self.role);
      const current = new Set(state.requests.map((r) => r.id));
      for (const request of state.requests) {
        if (staff && !shown.has(request.id) && request.requester.userId !== self.userId) {
          shown.add(request.id);
          toast(`${request.requester.name} wants to ${describeAction(request.action)}`, {
            id: request.id,
            duration: Math.max(0, request.expiresAt - Date.now()),
            action: {
              label: 'Approve',
              onClick: () => {
                resolve(request.id, true);
              },
            },
            cancel: {
              label: 'Reject',
              onClick: () => {
                resolve(request.id, false);
              },
            },
          });
        }
      }
      for (const id of shown) {
        if (!current.has(id)) {
          shown.delete(id);
          toast.dismiss(id);
        }
      }
    });
    return unsubscribe;
  }, [store, resolve]);
};
