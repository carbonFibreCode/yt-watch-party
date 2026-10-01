import type { ControlMode } from './usePlaybackCommand';

/** What a control does for the current user's role. */
export const hintFor = (mode: ControlMode, direct: string, request: string): string => {
  switch (mode) {
    case 'direct':
      return direct;
    case 'request':
      return `${request} (the host or a moderator approves)`;
    case 'none':
      return "Viewers can watch and chat but can't change playback";
  }
};
