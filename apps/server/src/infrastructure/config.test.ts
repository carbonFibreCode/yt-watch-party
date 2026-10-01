import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults and normalizes the public origin', () => {
    expect(loadConfig({ PUBLIC_ORIGIN: 'https://watch.example.com/some/path' })).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'info',
      publicOrigin: 'https://watch.example.com',
      webDistDir: undefined,
    });
  });

  it('parses explicit values', () => {
    expect(
      loadConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'warn',
        PUBLIC_ORIGIN: 'http://localhost:5173',
        WEB_DIST_DIR: '/srv/web',
      }),
    ).toMatchObject({ nodeEnv: 'production', port: 8080, logLevel: 'warn', webDistDir: '/srv/web' });
  });

  it('fails fast with a readable message', () => {
    const load = () => loadConfig({ PORT: 'eighty' });
    expect(load).toThrow(/^Invalid environment/);
    expect(load).toThrow(/at PORT/);
    expect(load).toThrow(/at PUBLIC_ORIGIN/);
  });
});
