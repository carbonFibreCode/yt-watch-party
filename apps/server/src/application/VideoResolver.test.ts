import { describe, expect, it } from 'vitest';
import { DomainError } from '../domain/DomainError';
import { StubVideoMetadataProvider } from './test/fakes';
import { VideoResolver } from './VideoResolver';

describe('VideoResolver', () => {
  it('resolves a URL to a video and its start offset', async () => {
    const resolved = await new VideoResolver(new StubVideoMetadataProvider()).resolve(
      'https://youtu.be/dQw4w9WgXcQ?t=1m5s',
    );
    expect(resolved).toMatchObject({ video: { id: 'dQw4w9WgXcQ' }, startAt: 65 });
  });

  it('defaults the start offset to zero', async () => {
    const resolved = await new VideoResolver(new StubVideoMetadataProvider()).resolve('dQw4w9WgXcQ');
    expect(resolved.startAt).toBe(0);
  });

  it('rejects input that is not a YouTube video', async () => {
    await expect(new VideoResolver(new StubVideoMetadataProvider()).resolve('hello')).rejects.toEqual(
      new DomainError('INVALID_VIDEO'),
    );
  });

  it('surfaces metadata failures such as disabled embedding', async () => {
    const metadata = new StubVideoMetadataProvider();
    metadata.failures.set('dQw4w9WgXcQ', 'EMBED_DISABLED');
    await expect(new VideoResolver(metadata).resolve('dQw4w9WgXcQ')).rejects.toEqual(
      new DomainError('EMBED_DISABLED'),
    );
  });
});
