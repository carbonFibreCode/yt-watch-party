import { pino } from 'pino';
import type { Logger as PinoLogger } from 'pino';
import type { AppConfig } from './config';

/** Structured JSON logs. Never log chat text, emails, cookies or tokens. */
export const createLogger = (level: AppConfig['logLevel']): PinoLogger =>
  pino({
    level,
    base: { service: 'watchparty-server' },
    redact: { paths: ['req.headers.cookie', 'req.headers.authorization'], remove: true },
  });
