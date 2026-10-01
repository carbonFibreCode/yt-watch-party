import { describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '@/test/fakeSocket';
import { createRpc, RpcError } from './rpc';

describe('createRpc', () => {
  it('sends the event with its payload and resolves with the ack data', async () => {
    const socket = new FakeSocket();
    socket.reply = () => Promise.resolve({ ok: true, data: { requestId: 'r1', expiresAt: 2 } });
    const rpc = createRpc(socket.asSocket(), { onError: vi.fn() });
    expect(await rpc('request_action', { action: { type: 'play' } })).toEqual({
      requestId: 'r1',
      expiresAt: 2,
    });
    expect(socket.sent).toEqual([{ event: 'request_action', payload: { action: { type: 'play' } } }]);
  });

  it('reports refusals once and throws a typed error', async () => {
    const socket = new FakeSocket();
    socket.reply = () => Promise.resolve({ ok: false, error: { code: 'FORBIDDEN', message: 'nope' } });
    const onError = vi.fn();
    const rpc = createRpc(socket.asSocket(), { onError });
    await expect(rpc('seek', { time: 3 })).rejects.toEqual(new RpcError('FORBIDDEN'));
    expect(onError).toHaveBeenCalledWith({ code: 'FORBIDDEN', message: 'nope' });
  });

  it('turns an ack timeout into a TIMEOUT error', async () => {
    const socket = new FakeSocket();
    socket.reply = () => Promise.reject(new Error('operation has timed out'));
    const onError = vi.fn();
    await expect(createRpc(socket.asSocket(), { onError })('pause', {})).rejects.toEqual(
      new RpcError('TIMEOUT'),
    );
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'TIMEOUT' }));
  });
});
