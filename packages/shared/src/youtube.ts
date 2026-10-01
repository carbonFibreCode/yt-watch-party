import getVideoId from 'get-video-id';
import { VIDEO_ID_PATTERN } from './contract/primitives';
import type { VideoId } from './contract/primitives';

/**
 * YouTube URL handling (LLD SP-11). Parsing is delegated to `get-video-id` (rules.md §5);
 * this module only narrows its result to a valid YouTube id.
 */

export const parseYouTubeId = (input: string): VideoId | null => {
  const trimmed = input.trim();
  if (VIDEO_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }
  const { id, service } = getVideoId(trimmed);
  return service === 'youtube' && typeof id === 'string' && VIDEO_ID_PATTERN.test(id) ? id : null;
};

const TIME_PARAMS = ['t', 'start'] as const;
const PLAIN_SECONDS = /^\d+s?$/;
const HMS = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

const parseTimeValue = (value: string): number | null => {
  if (PLAIN_SECONDS.test(value)) {
    return Number.parseInt(value, 10);
  }
  const match = HMS.exec(value);
  if (match === null || value === '') {
    return null;
  }
  const [, h = '0', m = '0', s = '0'] = match;
  return Number(h) * SECONDS_PER_HOUR + Number(m) * SECONDS_PER_MINUTE + Number(s);
};

/** Reads a start offset from `t=` / `start=` (`90`, `90s`, `1m30s`, `1h2m3s`), in the query or hash. */
export const parseStartTime = (input: string): number | null => {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  for (const params of [url.searchParams, hashParams]) {
    for (const key of TIME_PARAMS) {
      const raw = params.get(key);
      if (raw !== null) {
        return parseTimeValue(raw);
      }
    }
  }
  return null;
};

export const youtubeWatchUrl = (id: VideoId): string => `https://www.youtube.com/watch?v=${id}`;

export const youtubeThumbnailUrl = (id: VideoId): string => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
