import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const REQUIRED = {
  PUBLIC_ORIGIN: 'https://watch.example.com/some/path',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('applies defaults and normalizes the public origin', () => {
    expect(loadConfig(REQUIRED)).toEqual({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'info',
      publicOrigin: 'https://watch.example.com',
      webDistDir: undefined,
      databaseUrl: REQUIRED.DATABASE_URL,
      auth: {
        secret: REQUIRED.BETTER_AUTH_SECRET,
        baseUrl: 'https://watch.example.com',
        clientIpHeaders: ['x-forwarded-for'],
      },
    });
  });

  it('parses explicit values', () => {
    expect(
      loadConfig({
        ...REQUIRED,
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'warn',
        WEB_DIST_DIR: '/srv/web',
        BETTER_AUTH_URL: 'https://auth.example.com',
        CLIENT_IP_HEADERS: ' CF-Connecting-IP , x-forwarded-for ',
      }),
    ).toMatchObject({
      nodeEnv: 'production',
      port: 8080,
      logLevel: 'warn',
      webDistDir: '/srv/web',
      auth: { baseUrl: 'https://auth.example.com', clientIpHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    });
  });

  it('rejects a short auth secret', () => {
    expect(() => loadConfig({ ...REQUIRED, BETTER_AUTH_SECRET: 'short' })).toThrow(/at BETTER_AUTH_SECRET/);
  });

  it('fails fast with a readable message', () => {
    const load = () => loadConfig({ PORT: 'eighty' });
    expect(load).toThrow(/^Invalid environment/);
    expect(load).toThrow(/at PORT/);
    expect(load).toThrow(/at PUBLIC_ORIGIN/);
    expect(load).toThrow(/at DATABASE_URL/);
  });
});
