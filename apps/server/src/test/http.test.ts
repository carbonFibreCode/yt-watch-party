import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from './server';
import type { TestServer } from './server';

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('http app', () => {
  it('reports health', async () => {
    server = await startServer();
    const response = await fetch(`${server.url}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', checks: {}, uptimeS: 0 });
  });

  it('answers unknown API routes with a JSON 404', async () => {
    server = await startServer();
    const response = await fetch(`${server.url}/api/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  it('sends security headers that allow the YouTube player and nothing else framing us', async () => {
    server = await startServer();
    const response = await fetch(`${server.url}/api/health`);
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('frame-src https://www.youtube.com https://www.youtube-nocookie.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-powered-by')).toBeNull();
  });

  it('serves the SPA with a history fallback when a build is present', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'wp-web-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Watch Party</title>');
    writeFileSync(join(dist, 'app.js'), 'console.log(1)');
    server = await startServer(dist);
    expect(await (await fetch(`${server.url}/r/K7M2QX`)).text()).toContain('<title>Watch Party</title>');
    expect(await (await fetch(`${server.url}/app.js`)).text()).toBe('console.log(1)');
  });
});
