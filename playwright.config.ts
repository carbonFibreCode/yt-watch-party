import { defineConfig, devices } from '@playwright/test';

const LOCAL_WEB_URL = 'http://localhost:5173';
/** Set to a deployed URL (e.g. the Render service) to smoke-test production instead of the dev stack. */
const TARGET_URL = process.env.E2E_BASE_URL;
const SERVER_HEALTH = 'http://localhost:3000/api/health';
const START_TIMEOUT_MS = 120_000;

/**
 * Browser end-to-end tests (LLD SP-22). By default against the real dev stack (Vite + server +
 * Postgres; requires `docker compose up -d` and a filled-in .env). With E2E_BASE_URL set, the
 * same suites run against a deployed environment and no local servers are started.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: [['list']],
  // A deployed environment adds real network latency (and free-tier cold starts) to every step.
  timeout: TARGET_URL !== undefined ? 90_000 : 30_000,
  expect: { timeout: TARGET_URL !== undefined ? 20_000 : 5_000 },
  use: {
    baseURL: TARGET_URL ?? LOCAL_WEB_URL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    // Real YouTube playback without a click; the muted/blocked fallbacks are covered by unit tests.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer:
    TARGET_URL !== undefined
      ? []
      : [
          {
            command: 'pnpm --filter @watchparty/server dev',
            url: SERVER_HEALTH,
            reuseExistingServer: true,
            timeout: START_TIMEOUT_MS,
          },
          {
            command: 'pnpm --filter @watchparty/web dev',
            url: LOCAL_WEB_URL,
            reuseExistingServer: true,
            timeout: START_TIMEOUT_MS,
          },
        ],
});
