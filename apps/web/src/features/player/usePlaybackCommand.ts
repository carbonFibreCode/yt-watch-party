import { useCallback } from 'react';
import { toastNotifier } from '@/features/room/notifier';
import { useRpc } from '@/features/room/RoomContext';
import { useCan } from '@/features/room/useCan';
import { RpcError } from '@/lib/rpc';
import type { RequestableAction } from '@watchparty/shared';

/** How the current user can change playback: do it, ask for it, or neither (LLD SP-10). */
export type ControlMode = 'direct' | 'request' | 'none';

const REQUEST_LABEL: Readonly<Record<RequestableAction['type'], string>> = {
  play: 'play',
  pause: 'pause',
  seek: 'jump',
  change_video: 'video change',
  queue_add: 'queue addition',
};

export interface PlaybackCommand {
  readonly mode: ControlMode;
  /** Performs (or requests) the action; resolves false if it was refused (already shown to the user). */
  readonly send: (action: RequestableAction) => Promise<boolean>;
}

/** The single entry point for every playback control, so all controls behave identically per role. */
export const usePlaybackCommand = (): PlaybackCommand => {
  const rpc = useRpc();
  const canControl = useCan('playback.control');
  const canRequest = useCan('request.create');
  const mode: ControlMode = canControl ? 'direct' : canRequest ? 'request' : 'none';

  const send = useCallback(
    async (action: RequestableAction): Promise<boolean> => {
      try {
        if (mode === 'none') {
          return false;
        }
        if (mode === 'request') {
          await rpc('request_action', { action });
          toastNotifier.success(`Asked the host for a ${REQUEST_LABEL[action.type]}.`);
          return true;
        }
        switch (action.type) {
          case 'play':
            await rpc('play', {});
            break;
          case 'pause':
            await rpc('pause', {});
            break;
          case 'seek':
            await rpc('seek', { time: action.time });
            break;
          case 'change_video':
            await rpc('change_video', { url: action.url });
            break;
          case 'queue_add':
            await rpc('queue_add', { url: action.url });
            break;
        }
        return true;
      } catch (error) {
        if (error instanceof RpcError) {
          return false;
        }
        throw error;
      }
    },
    [mode, rpc],
  );

  return { mode, send };
};
