import { describe, expect, it } from 'vitest';
import { CLIENT_EVENT_NAMES, ClientEventSchemas } from '@watchparty/shared';
import type { ClientEventName } from '@watchparty/shared';
import { buildHarness } from '../test/harness';
import type { CommandHandler } from './CommandHandler';
import { CommandRegistry } from './CommandRegistry';
import { registerAllHandlers } from './registerAllHandlers';

class CapturingRegistry extends CommandRegistry {
  readonly handlers: CommandHandler<ClientEventName>[] = [];

  override register<E extends ClientEventName>(handler: CommandHandler<E>): this {
    this.handlers.push(handler);
    return super.register(handler);
  }
}

const capture = () => {
  const h = buildHarness();
  const registry = new CapturingRegistry(h.pipeline);
  registerAllHandlers(registry, { ...h, broadcaster: h.broadcaster });
  return registry;
};

describe('CommandRegistry', () => {
  it('registers a handler for every contract event', () => {
    const registry = capture();
    expect(() => {
      registry.assertComplete();
    }).not.toThrow();
    expect([...registry.events()].sort()).toEqual([...CLIENT_EVENT_NAMES].sort());
  });

  it('binds every handler to the contract schema of its own event', () => {
    for (const handler of capture().handlers) {
      expect(handler.schema, handler.event).toBe(ClientEventSchemas[handler.event]);
    }
  });

  it('declares membership for every handler that requires a capability', () => {
    for (const handler of capture().handlers) {
      if (handler.capability !== null) {
        expect(handler.requiresMembership, handler.event).toBe(true);
      }
    }
  });

  it('reports missing handlers at boot', () => {
    expect(() => {
      new CommandRegistry(buildHarness().pipeline).assertComplete();
    }).toThrow(/Missing command handlers: join_room/);
  });

  it('refuses duplicate registrations', () => {
    const h = buildHarness();
    expect(() => registerAllHandlers(h.registry, h)).toThrow(/Duplicate handler/);
  });
});
