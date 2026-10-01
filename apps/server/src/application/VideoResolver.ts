import { parseStartTime, parseYouTubeId } from '@watchparty/shared';
import { DomainError } from '../domain/DomainError';
import type { VideoRef } from '../domain/VideoRef';
import type { VideoMetadataProvider } from './ports';

export interface ResolvedVideo {
  readonly video: VideoRef;
  readonly startAt: number;
}

/** Raw user input → embeddable video + start offset (LLD SP-11). Used by sockets and REST alike. */
export class VideoResolver {
  constructor(private readonly metadata: VideoMetadataProvider) {}

  async resolve(input: string): Promise<ResolvedVideo> {
    const videoId = parseYouTubeId(input);
    if (videoId === null) {
      throw new DomainError('INVALID_VIDEO');
    }
    const video = await this.metadata.lookup(videoId);
    return { video, startAt: parseStartTime(input) ?? 0 };
  }
}
