import { useRoom } from '@/features/room/RoomContext';
import { useCan } from '@/features/room/useCan';

/** Requests waiting for this user to resolve: 0 unless they are staff (host or moderator). */
export const usePendingRequestsForStaff = (): number => {
  const canResolve = useCan('request.resolve');
  const count = useRoom((s) => s.requests.length);
  return canResolve ? count : 0;
};
