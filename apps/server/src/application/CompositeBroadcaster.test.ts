import { describe, expect, it } from 'vitest';
import { Room } from '../domain/Room';
import { CompositeBroadcaster } from './CompositeBroadcaster';
import type { RoomEventListener } from './ports';
import { RecordingBroadcaster, T0 } from './test/fakes';

describe('CompositeBroadcaster', () => {
  it('publishes to the transport first, then notifies every listener with the same batch', async () => {
    const transport = new RecordingBroadcaster();
    const order: string[] = [];
    const listener = (name: string): RoomEventListener => ({
      onEvents: (_room, events) => {
        order.push(`${name}:${String(events.length)}:${String(transport.published.length)}`);
      },
    });
    const composite = new CompositeBroadcaster(transport).subscribe(listener('a')).subscribe(listener('b'));
    const room = Room.create({ id: 'K7M2QX', name: 'x', host: { userId: 'h', name: 'H' }, now: T0 });
    await composite.publish(room, [{ type: 'QueueChanged' }]);
    expect(order).toEqual(['a:1:1', 'b:1:1']);
  });

  it('forwards side-channel emits to the transport', () => {
    const transport = new RecordingBroadcaster();
    new CompositeBroadcaster(transport).toRoom('K7M2QX', 'queue_updated', { queue: [] });
    expect(transport.sent).toEqual([{ roomId: 'K7M2QX', event: 'queue_updated', payload: { queue: [] } }]);
  });
});
