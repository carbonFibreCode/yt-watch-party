import { createBrowserRouter } from 'react-router';
import { LandingPage } from '@/features/lobby/LandingPage';
import { RoomSkeleton } from '@/features/room/RoomSkeleton';
import { NotFoundPage } from './NotFoundPage';
import { RemovedPage } from './RemovedPage';
import { RouteErrorPage } from './RouteErrorPage';

export const router = createBrowserRouter([
  {
    ErrorBoundary: RouteErrorPage,
    children: [
      { index: true, Component: LandingPage },
      // Code-split: the room (socket, player, room UI) loads only when a room is opened.
      {
        path: 'r/:code',
        // Shown on a direct room link while the room code downloads, instead of a blank page.
        HydrateFallback: RoomSkeleton,
        lazy: async () => ({ Component: (await import('@/features/room/RoomPage')).RoomPage }),
      },
      { path: 'removed', Component: RemovedPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
