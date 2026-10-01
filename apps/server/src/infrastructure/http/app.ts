import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { static as serveStatic } from 'express';
import type { ErrorRequestHandler, Express } from 'express';
import type { Logger as PinoLogger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { ErrorCode, HealthResponse, HttpErrorResponse } from '@watchparty/shared';
import { errorOf } from '@watchparty/shared';
import type { Clock } from '../../application/ports';
import { securityHeaders } from './securityHeaders';

export interface HealthCheck {
  readonly name: string;
  check(): Promise<boolean>;
}

export interface HttpAppOptions {
  readonly logger: PinoLogger;
  readonly clock: Clock;
  readonly startedAt: number;
  readonly healthChecks: readonly HealthCheck[];
  /** Built SPA to serve; skipped when absent (Vite serves it in development). */
  readonly webDistDir: string | undefined;
}

const MS_PER_SECOND = 1000;

const errorBody = (code: ErrorCode): HttpErrorResponse => ({ error: errorOf(code) });

/** Express app: security headers, request logs, health, API 404s and the SPA (LLD SP-18). */
export const createHttpApp = (options: HttpAppOptions): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders());
  app.use(pinoHttp({ logger: options.logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.get('/api/health', async (_req, res) => {
    const results = await Promise.all(
      options.healthChecks.map(async (c) => [c.name, await c.check().catch(() => false)] as const),
    );
    const checks = Object.fromEntries(results);
    const body: HealthResponse = {
      status: results.every(([, ok]) => ok) ? 'ok' : 'degraded',
      checks,
      uptimeS: Math.round((options.clock.now() - options.startedAt) / MS_PER_SECOND),
    };
    res.status(body.status === 'ok' ? 200 : 503).json(body);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json(errorBody('NOT_FOUND'));
  });

  const { webDistDir } = options;
  if (webDistDir !== undefined && existsSync(join(webDistDir, 'index.html'))) {
    app.use(serveStatic(webDistDir, { index: false }));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(join(webDistDir, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    req.log.error({ err: error }, 'unhandled http error');
    res.status(500).json(errorBody('INTERNAL'));
  };
  app.use(onError);

  return app;
};
