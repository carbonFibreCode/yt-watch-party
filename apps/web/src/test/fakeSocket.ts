import type { RoomSocket } from '@/lib/socket';

type Listener = (payload: unknown) => void;

/**
 * Minimal in-memory stand-in for a Socket.IO client: records listeners, lets tests emit
 * server events, and answers acknowledged emits with a scripted reply.
 */
export class FakeSocket {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly sent: { event: string; payload: unknown }[] = [];
  reply: (event: string, payload: unknown) => Promise<unknown> = () =>
    Promise.resolve({ ok: true, data: {} });

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  timeout(): { emitWithAck: (event: string, payload: unknown) => Promise<unknown> } {
    return {
      emitWithAck: (event, payload) => {
        this.sent.push({ event, payload });
        return this.reply(event, payload);
      },
    };
  }

  /** Simulates a server → client event. */
  serverEmit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }

  asSocket(): RoomSocket {
    return this as unknown as RoomSocket;
  }
}
