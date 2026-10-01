import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import {
  OEMBED_CACHE_MAX,
  OEMBED_CACHE_TTL_MS,
  OEMBED_NEGATIVE_TTL_MS,
  OEMBED_TIMEOUT_MS,
  VIDEO_FALLBACK_TITLE,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from '@watchparty/shared';
import type { ErrorCode, VideoId } from '@watchparty/shared';
import type { Logger, VideoMetadataProvider } from '../../application/ports';
import { DomainError } from '../../domain/DomainError';
import type { VideoRef } from '../../domain/VideoRef';

const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';

const OEmbedResponse = z.object({ title: z.string().min(1), thumbnail_url: z.url().optional() });

/** HTTP statuses YouTube's oEmbed uses for "this video can't be used here". */
const STATUS_ERRORS: ReadonlyMap<number, ErrorCode> = new Map([
  [400, 'INVALID_VIDEO'],
  [401, 'EMBED_DISABLED'],
  [403, 'EMBED_DISABLED'],
  [404, 'INVALID_VIDEO'],
]);

type CacheEntry = { readonly video: VideoRef } | { readonly error: ErrorCode };

export type FetchFn = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/**
 * Keyless video metadata + embeddability check via YouTube oEmbed (LLD SP-11). Network trouble
 * degrades to a generic title rather than blocking playback; definite answers are cached.
 */
export class OEmbedMetadataProvider implements VideoMetadataProvider {
  private readonly cache = new LRUCache<VideoId, CacheEntry>({
    max: OEMBED_CACHE_MAX,
    ttl: OEMBED_CACHE_TTL_MS,
  });

  constructor(
    private readonly logger: Logger,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async lookup(videoId: VideoId): Promise<VideoRef> {
    const entry = this.cache.get(videoId) ?? (await this.fetchEntry(videoId));
    if ('error' in entry) {
      throw new DomainError(entry.error);
    }
    return entry.video;
  }

  private async fetchEntry(videoId: VideoId): Promise<CacheEntry> {
    const url = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(youtubeWatchUrl(videoId))}&format=json`;
    try {
      const response = await this.fetchFn(url, { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) });
      const error = STATUS_ERRORS.get(response.status);
      if (error !== undefined) {
        const entry = { error };
        this.cache.set(videoId, entry, { ttl: OEMBED_NEGATIVE_TTL_MS });
        return entry;
      }
      if (!response.ok) {
        return this.fallback(videoId, `status ${String(response.status)}`);
      }
      const body = OEmbedResponse.parse(await response.json());
      const entry = {
        video: {
          id: videoId,
          title: body.title,
          thumbnailUrl: body.thumbnail_url ?? youtubeThumbnailUrl(videoId),
        },
      };
      this.cache.set(videoId, entry);
      return entry;
    } catch (error) {
      return this.fallback(videoId, error);
    }
  }

  /** Not cached: the next lookup tries again. */
  private fallback(videoId: VideoId, reason: unknown): CacheEntry {
    this.logger.warn({ videoId, reason }, 'oEmbed unavailable, using fallback metadata');
    return {
      video: { id: videoId, title: VIDEO_FALLBACK_TITLE, thumbnailUrl: youtubeThumbnailUrl(videoId) },
    };
  }
}
