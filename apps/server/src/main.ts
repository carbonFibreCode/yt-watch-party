import { fileURLToPath } from 'node:url';
import { SHUTDOWN_TIMEOUT_MS } from '@watchparty/shared';
import { composeApp } from './compose';
import { StaticSessionResolver } from './infrastructure/auth/StaticSessionResolver';
import { loadConfig } from './infrastructure/config';
import { createLogger } from './infrastructure/logger';

/** Process entry: config → compose → listen → graceful shutdown (LLD SP-20). */
const DEFAULT_WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

const config = loadConfig({ WEB_DIST_DIR: DEFAULT_WEB_DIST, ...process.env });
const logger = createLogger(config.logLevel);

if (config.nodeEnv === 'production') {
  // Real authentication (better-auth) is wired in Phase 5; refuse to run production without it.
  logger.fatal('production authentication is not configured');
  process.exit(1);
}

const app = composeApp({ config, logger, sessions: new StaticSessionResolver() });

app.httpServer.once('error', (error) => {
  logger.fatal({ err: error, port: config.port }, 'server failed to start');
  process.exit(1);
});

app.httpServer.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'server listening');
});

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    logger.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  app.close().then(
    () => process.exit(0),
    (error: unknown) => {
      logger.error({ err: error }, 'shutdown failed');
      process.exit(1);
    },
  );
};

process.once('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.once('SIGINT', () => {
  shutdown('SIGINT');
});
