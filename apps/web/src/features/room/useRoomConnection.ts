import { useEffect, useState } from 'react';
import { TimesyncClock } from '@/features/player/TimesyncClock';
import { createRpc, RpcError } from '@/lib/rpc';
import { createSocket } from '@/lib/socket';
import type { RoomCode } from '@watchparty/shared';
import { bindRoomEvents } from './bindRoomEvents';
import { toastNotifier } from './notifier';
import type { RoomContextValue } from './RoomContext';
import { createRoomStore } from './store';

/** The handshake error message the server's auth middleware uses (LLD SP-2). */
const UNAUTHENTICATED = 'UNAUTHENTICATED';

/**
 * Owns one socket for the lifetime of a room visit (LLD SP-14): binds events, joins on every
 * fresh connection (a recovered connection keeps its membership), syncs the server clock and
 * tracks transport state. Unmounting only disconnects; leaving is explicit, so a refresh is
 * absorbed by the grace period.
 */
export const useRoomConnection = (roomId: RoomCode): RoomContextValue => {
  const [connection] = useState(() => {
    const socket = createSocket();
    const store = createRoomStore();
    const rpc = createRpc(socket, {
      onError: (error) => {
        toastNotifier.error(error.message);
      },
    });
    const quietRpc = createRpc(socket, { onError: () => undefined });
    const clock = new TimesyncClock((request) => quietRpc('timesync', request));
    return { socket, store, rpc, quietRpc, clock };
  });

  useEffect(() => {
    const { socket, store, rpc, clock } = connection;
    const unbind = bindRoomEvents(socket, store, toastNotifier, () => Date.now());

    const onConnect = (): void => {
      store.getState().setConnection('online');
      clock.start();
      if (socket.recovered) {
        return;
      }
      rpc('join_room', { roomId }).then(
        (ack) => {
          store.getState().hydrate(ack);
        },
        (error: unknown) => {
          store.getState().fail(error instanceof RpcError ? error.code : 'INTERNAL');
        },
      );
    };
    const onDisconnect = (): void => {
      store.getState().setConnection('reconnecting');
    };
    const onConnectError = (error: Error): void => {
      if (error.message === UNAUTHENTICATED) {
        store.getState().fail(UNAUTHENTICATED);
        return;
      }
      store.getState().setConnection('reconnecting');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.connect();

    return () => {
      unbind();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      clock.stop();
      socket.disconnect();
    };
  }, [connection, roomId]);

  return connection;
};
