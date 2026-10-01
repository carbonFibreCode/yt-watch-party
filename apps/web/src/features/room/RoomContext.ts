import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { Rpc } from '@/lib/rpc';
import type { RoomState, RoomStore } from './store';

export interface RoomContextValue {
  readonly store: RoomStore;
  readonly rpc: Rpc;
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
