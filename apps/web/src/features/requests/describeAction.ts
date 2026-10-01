import { formatDuration } from '@/lib/format';
import type { RequestActionView } from '@watchparty/shared';

/** A request in plain words, e.g. "jump to 1:23" or "play “Never Gonna Give You Up”". */
export const describeAction = (action: RequestActionView): string => {
  switch (action.type) {
    case 'play':
      return 'resume playback';
    case 'pause':
      return 'pause';
    case 'seek':
      return `jump to ${formatDuration(action.time)}`;
    case 'change_video':
      return `play “${action.video.title}”`;
    case 'queue_add':
      return `queue “${action.video.title}”`;
  }
};
