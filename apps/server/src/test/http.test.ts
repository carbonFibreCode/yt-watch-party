import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { call, startServer } from './server';
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

  it('hides /metrics unless a token is configured', async () => {
    server = await startServer();
    expect((await fetch(`${server.url}/metrics`)).status).toBe(404);
  });

  it('serves Prometheus metrics to the bearer of the token only', async () => {
    const token = 'm'.repeat(32);
    server = await startServer({ metricsToken: token });
    expect((await fetch(`${server.url}/metrics`)).status).toBe(401);
    expect(
      (await fetch(`${server.url}/metrics`, { headers: { authorization: `Bearer ${'x'.repeat(32)}` } }))
        .status,
    ).toBe(401);

    const { id } = await server.app.rooms.create('Metered', { userId: 'u-host', name: 'Hana' });
    const host = await server.connect('u-host:Hana');
    await call(host, 'join_room', { roomId: id });
    await call(host, 'pause', {});
    const response = await fetch(`${server.url}/metrics`, { headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    const body = await response.text();
    expect(body).toContain('wp_sockets_connected 1');
    expect(body).toContain('wp_rooms_active 1');
    expect(body).toContain('wp_commands_total{event="join_room",outcome="ok"} 1');
    expect(body).toContain('wp_commands_total{event="pause",outcome="ok"} 1');
    // The host is already a member, so their join is a presence change.
    expect(body).toContain('wp_broadcast_events_total{event="presence_changed"} 1');
    expect(body).toContain('wp_cas_attempts_count');
    expect(body).toContain('process_cpu_user_seconds_total');
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

  it('sends HTTPS-only headers in production', async () => {
    server = await startServer({ nodeEnv: 'production' });
    const response = await fetch(`${server.url}/api/health`);
    expect(response.headers.get('strict-transport-security')).toContain('max-age=');
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain('http://www.youtube.com');
  });

  it('keeps plain-http development usable: no HSTS or upgrade-insecure-requests outside production', async () => {
    server = await startServer();
    const response = await fetch(`${server.url}/api/health`);
    expect(response.headers.get('strict-transport-security')).toBeNull();
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).not.toContain('upgrade-insecure-requests');
    // youtube-player loads the API over the page's scheme, i.e. http: here.
    expect(csp).toContain('http://www.youtube.com');
  });

  it('serves the SPA with a history fallback when a build is present', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'wp-web-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Watch Party</title>');
    writeFileSync(join(dist, 'app.js'), 'console.log(1)');
    server = await startServer({ webDistDir: dist });
    expect(await (await fetch(`${server.url}/r/K7M2QX`)).text()).toContain('<title>Watch Party</title>');
    expect(await (await fetch(`${server.url}/app.js`)).text()).toBe('console.log(1)');
  });
});
