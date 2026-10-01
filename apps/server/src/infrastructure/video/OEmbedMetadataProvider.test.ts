import { describe, expect, it, vi } from 'vitest';
import { VIDEO_FALLBACK_TITLE } from '@watchparty/shared';
import { RecordingLogger } from '../../application/test/fakes';
import { DomainError } from '../../domain/DomainError';
import { OEmbedMetadataProvider } from './OEmbedMetadataProvider';
import type { FetchFn } from './OEmbedMetadataProvider';

const ID = 'dQw4w9WgXcQ';

const respond = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const provider = (impl: FetchFn) => {
  const fetchFn = vi.fn(impl);
  const logger = new RecordingLogger();
  return { fetchFn, logger, metadata: new OEmbedMetadataProvider(logger, fetchFn) };
};

describe('OEmbedMetadataProvider', () => {
  it('returns title and thumbnail from oEmbed, querying the canonical watch URL', async () => {
    const { metadata, fetchFn } = provider(() =>
      Promise.resolve(respond(200, { title: 'Rick', thumbnail_url: 'https://i.ytimg.com/vi/x/hq.jpg' })),
    );
    expect(await metadata.lookup(ID)).toEqual({
      id: ID,
      title: 'Rick',
      thumbnailUrl: 'https://i.ytimg.com/vi/x/hq.jpg',
    });
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`)}&format=json`,
    );
  });

  it('derives the thumbnail when oEmbed omits it', async () => {
    const { metadata } = provider(() => Promise.resolve(respond(200, { title: 'Rick' })));
    expect((await metadata.lookup(ID)).thumbnailUrl).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it.each([
    [400, 'INVALID_VIDEO'],
    [404, 'INVALID_VIDEO'],
    [401, 'EMBED_DISABLED'],
    [403, 'EMBED_DISABLED'],
  ] as const)('maps HTTP %i to %s', async (status, code) => {
    const { metadata } = provider(() => Promise.resolve(respond(status)));
    await expect(metadata.lookup(ID)).rejects.toEqual(new DomainError(code));
  });

  it('caches successes and definite failures', async () => {
    const ok = provider(() => Promise.resolve(respond(200, { title: 'Rick' })));
    await ok.metadata.lookup(ID);
    await ok.metadata.lookup(ID);
    expect(ok.fetchFn).toHaveBeenCalledOnce();

    const denied = provider(() => Promise.resolve(respond(401)));
    await expect(denied.metadata.lookup(ID)).rejects.toThrow();
    await expect(denied.metadata.lookup(ID)).rejects.toThrow();
    expect(denied.fetchFn).toHaveBeenCalledOnce();
  });

  it.each([
    ['a server error', () => Promise.resolve(respond(500))],
    ['a network failure', () => Promise.reject(new TypeError('fetch failed'))],
    ['an unexpected body', () => Promise.resolve(respond(200, { nope: true }))],
  ])('degrades to fallback metadata on %s, without caching it', async (_label, impl: FetchFn) => {
    const { metadata, fetchFn, logger } = provider(impl);
    expect(await metadata.lookup(ID)).toEqual({
      id: ID,
      title: VIDEO_FALLBACK_TITLE,
      thumbnailUrl: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
    });
    await metadata.lookup(ID);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(logger.entries[0]).toMatchObject({ level: 'warn', fields: { videoId: ID } });
  });
});
