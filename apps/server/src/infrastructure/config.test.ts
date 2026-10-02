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
      metricsToken: undefined,
      databaseUrl: REQUIRED.DATABASE_URL,
      redisUrl: undefined,
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
        REDIS_URL: 'rediss://default:secret@redis.internal:6379',
      }),
    ).toMatchObject({
      nodeEnv: 'production',
      port: 8080,
      logLevel: 'warn',
      webDistDir: '/srv/web',
      redisUrl: 'rediss://default:secret@redis.internal:6379',
      auth: { baseUrl: 'https://auth.example.com', clientIpHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    });
  });

  it('only accepts a redis:// or rediss:// REDIS_URL', () => {
    expect(() => loadConfig({ ...REQUIRED, REDIS_URL: 'http://localhost:6379' })).toThrow(/at REDIS_URL/);
  });

  it('treats empty optional variables (NAME= in .env) as unset', () => {
    expect(
      loadConfig({ ...REQUIRED, METRICS_TOKEN: '', REDIS_URL: '', BETTER_AUTH_URL: '', WEB_DIST_DIR: '' }),
    ).toMatchObject({
      metricsToken: undefined,
      redisUrl: undefined,
      webDistDir: undefined,
      auth: { baseUrl: 'https://watch.example.com' },
    });
  });

  it('enables metrics only with a long enough token', () => {
    expect(loadConfig({ ...REQUIRED, METRICS_TOKEN: 't'.repeat(32) }).metricsToken).toBe('t'.repeat(32));
    expect(() => loadConfig({ ...REQUIRED, METRICS_TOKEN: 'short' })).toThrow(/at METRICS_TOKEN/);
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
