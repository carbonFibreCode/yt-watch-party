import { z } from 'zod';

const MIN_SECRET_LEN = 32;

/** An optional variable; `NAME=` with no value (as in .env.example) counts as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/** Environment, parsed once at boot; fails fast with readable errors (LLD SP-20). */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PUBLIC_ORIGIN: z.url(),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(MIN_SECRET_LEN),
  BETTER_AUTH_URL: optional(z.url()),
  /** Request headers carrying the real client IP, in order (e.g. `cf-connecting-ip` behind Cloudflare). */
  CLIENT_IP_HEADERS: z
    .string()
    .default('x-forwarded-for')
    .transform((value) =>
      value
        .split(',')
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean),
    ),
  WEB_DIST_DIR: optional(z.string()),
  /** Enables the multi-instance setup (Redis room store, rate limits and Socket.IO adapter). */
  REDIS_URL: optional(z.url({ protocol: /^rediss?$/ })),
  /** Enables GET /metrics with `Authorization: Bearer <token>`. */
  METRICS_TOKEN: optional(z.string().min(MIN_SECRET_LEN)),
});

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  /** Normalized origin (scheme://host[:port]) used for the WebSocket origin check. */
  readonly publicOrigin: string;
  readonly webDistDir: string | undefined;
  /** Absent: no /metrics endpoint. */
  readonly metricsToken: string | undefined;
}

export interface ServerConfig extends AppConfig {
  readonly databaseUrl: string;
  /** Absent: single-instance, in-memory strategies. */
  readonly redisUrl: string | undefined;
  readonly auth: {
    readonly secret: string;
    readonly baseUrl: string;
    readonly clientIpHeaders: readonly string[];
  };
}

export const loadConfig = (env: Readonly<Record<string, string | undefined>>): ServerConfig => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  const publicOrigin = new URL(e.PUBLIC_ORIGIN).origin;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    publicOrigin,
    webDistDir: e.WEB_DIST_DIR,
    metricsToken: e.METRICS_TOKEN,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    auth: {
      secret: e.BETTER_AUTH_SECRET,
      baseUrl: e.BETTER_AUTH_URL ?? publicOrigin,
      clientIpHeaders: e.CLIENT_IP_HEADERS,
    },
  };
};
