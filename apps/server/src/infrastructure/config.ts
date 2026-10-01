import { z } from 'zod';

/** Environment, parsed once at boot; fails fast with readable errors (LLD SP-20). */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PUBLIC_ORIGIN: z.url(),
  WEB_DIST_DIR: z.string().min(1).optional(),
});

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  /** Normalized origin (scheme://host[:port]) used for the WebSocket origin check. */
  readonly publicOrigin: string;
  readonly webDistDir: string | undefined;
}

export const loadConfig = (env: Readonly<Record<string, string | undefined>>): AppConfig => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    publicOrigin: new URL(e.PUBLIC_ORIGIN).origin,
    webDistDir: e.WEB_DIST_DIR,
  };
};
