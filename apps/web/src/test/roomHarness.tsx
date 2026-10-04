import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RoomContext } from '@/features/room/RoomContext';
import type { RoomContextValue } from '@/features/room/RoomContext';
import { createRoomStore } from '@/features/room/store';
import type { RoomStore } from '@/features/room/store';
import type { JoinRoomAck, Role } from '@watchparty/shared';
import { FakeClock } from './FakePlayer';
import { joinAck, participant } from './fixtures';

export interface RoomHarness {
  readonly store: RoomStore;
  readonly rpc: ReturnType<typeof vi.fn>;
  readonly clock: FakeClock;
  readonly wrapper: (props: { readonly children: ReactNode }) => ReactElement;
}

/** A joined room where the current user ("me") has `role`. */
export const roomHarness = (role: Role, room: Partial<JoinRoomAck['room']> = {}): RoomHarness => {
  const store = createRoomStore();
  const me = participant('me', { role });
  store.getState().hydrate(
    joinAck({
      self: me,
      hostId: role === 'host' ? 'me' : 'host',
      participants: role === 'host' ? [me] : [participant('host', { role: 'host', joinedAt: 0 }), me],
      ...room,
    }),
  );
  const rpc = vi.fn(() => Promise.resolve({}));
  const clock = new FakeClock(1_000);
  const value: RoomContextValue = {
    store,
    rpc: rpc as unknown as RoomContextValue['rpc'],
    quietRpc: vi.fn(() => Promise.resolve({})) as unknown as RoomContextValue['quietRpc'],
    clock,
  };
  const wrapper = ({ children }: { readonly children: ReactNode }): ReactElement => (
    <RoomContext.Provider value={value}>
      <TooltipProvider>{children}</TooltipProvider>
    </RoomContext.Provider>
  );
  return { store, rpc, clock, wrapper };
};

export const renderInRoom = (ui: ReactElement, harness: RoomHarness) =>
  render(ui, { wrapper: harness.wrapper });
