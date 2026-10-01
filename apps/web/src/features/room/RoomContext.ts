import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { ServerClock } from '@/features/player/ports';
import type { Rpc } from '@/lib/rpc';
import type { RoomState, RoomStore } from './store';

export interface RoomContextValue {
  readonly store: RoomStore;
  /** User commands: refusals are shown as toasts. */
  readonly rpc: Rpc;
  /** Background telemetry (clock sync, duration, end of video): failures are silent. */
  readonly quietRpc: Rpc;
  readonly clock: ServerClock;
}

export const RoomContext = createContext<RoomContextValue | null>(null);

const useRoomContext = (): RoomContextValue => {
  const value = useContext(RoomContext);
  if (value === null) {
    throw new Error('Room hooks must be used inside <RoomContext.Provider>');
  }
  return value;
};

/** Subscribe to one slice of room state (rules.md §9.3: always through a selector). */
export const useRoom = <T>(selector: (state: RoomState) => T): T =>
  useStore(useRoomContext().store, selector);

/** The room's command sender. */
export const useRpc = (): Rpc => useRoomContext().rpc;

export const useQuietRpc = (): Rpc => useRoomContext().quietRpc;

/** The room store itself, for imperative subscriptions outside React rendering. */
export const useRoomStore = (): RoomStore => useRoomContext().store;

/** Server time estimated on this client (LLD SP-12). */
export const useServerClock = (): ServerClock => useRoomContext().clock;
