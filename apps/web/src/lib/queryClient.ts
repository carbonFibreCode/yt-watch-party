import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

const MAX_RETRIES = 2;
const STALE_TIME_MS = 30_000;

/** Server state over REST (LLD SP-14). Client errors (4xx) are final; others retry briefly. */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        refetchOnWindowFocus: false,
        retry: (failures, error) =>
          !(error instanceof ApiError && error.status < 500) && failures < MAX_RETRIES,
      },
    },
  });
