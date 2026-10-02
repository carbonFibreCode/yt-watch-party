import { fileURLToPath } from 'node:url';
import { toNodeHandler } from 'better-auth/node';
import { SHUTDOWN_TIMEOUT_MS } from '@watchparty/shared';
import { composeApp } from './compose';
import { createAuth } from './infrastructure/auth/auth';
import { BetterAuthSessionResolver } from './infrastructure/auth/BetterAuthSessionResolver';
import { loadConfig } from './infrastructure/config';
import { createDatabase } from './infrastructure/db/client';
import { createLogger } from './infrastructure/logger';
import { createPostgresPersistence } from './infrastructure/persistence';

/**
 * Process entry: config → database (migrate) → auth → compose → listen → graceful shutdown
 * (LLD SP-20). Paths are resolved from this file, which sits one level under apps/server in both
 * development (src/) and production (dist/).
 */
const DEFAULT_WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

const config = loadConfig({ WEB_DIST_DIR: DEFAULT_WEB_DIST, ...process.env });
const logger = createLogger(config.logLevel);

const fail = (message: string) => (error: unknown) => {
  logger.fatal({ err: error }, message);
  process.exit(1);
};

const database = createDatabase(config.databaseUrl, MIGRATIONS_DIR);
await database.migrate().catch(fail('database migration failed'));

const persistence = createPostgresPersistence(database, logger);
const auth = createAuth({
  db: database.db,
  secret: config.auth.secret,
  baseUrl: config.auth.baseUrl,
  trustedOrigins: [config.publicOrigin],
  secureCookies: config.nodeEnv === 'production',
  rateLimit: config.nodeEnv === 'production',
  clientIpHeaders: config.auth.clientIpHeaders,
  memberships: persistence.memberships,
  logger,
});

const app = composeApp({
  config,
  logger,
  persistence,
  sessions: new BetterAuthSessionResolver(auth),
  authHandler: toNodeHandler(auth),
});

await app.start(config.port).catch(fail('server failed to start'));
logger.info({ port: config.port, env: config.nodeEnv }, 'server listening');

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    logger.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  app
    .close()
    .then(() => database.close())
    .then(
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
