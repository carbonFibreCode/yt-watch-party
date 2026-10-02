import type { RoomCode, ServerEventName, ServerToClientEvents } from '@watchparty/shared';
import type { DomainEvent } from '../domain/events';
import type { Room } from '../domain/Room';
import type { Broadcaster, RoomEventListener } from './ports';

/**
 * Publishes to the transport and then lets listeners observe the same batch (Observer). Keeps
 * follow-up behavior (like expiry timers) out of both the handlers and the socket layer (OCP).
 */
export class CompositeBroadcaster implements Broadcaster {
  private readonly listeners: RoomEventListener[] = [];

  constructor(private readonly transport: Broadcaster) {}

  subscribe(listener: RoomEventListener): this {
    this.listeners.push(listener);
    return this;
  }

  async publish(room: Room, events: readonly DomainEvent[]): Promise<void> {
    await this.transport.publish(room, events);
    for (const listener of this.listeners) {
      listener.onEvents(room, events);
    }
  }

  toRoom<E extends ServerEventName>(
    roomId: RoomCode,
    event: E,
    ...payload: Parameters<ServerToClientEvents[E]>
  ): void {
    this.transport.toRoom(roomId, event, ...payload);
  }
}
