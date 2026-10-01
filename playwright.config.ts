import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://localhost:5173';
const SERVER_HEALTH = 'http://localhost:3000/api/health';
const START_TIMEOUT_MS = 120_000;

/**
 * Browser end-to-end tests against the real dev stack (LLD SP-22): Vite + server + Postgres.
 * Requires `docker compose up -d` and a filled-in .env.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    // Real YouTube playback without a click; the muted/blocked fallbacks are covered by unit tests.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: [
    {
      command: 'pnpm --filter @watchparty/server dev',
      url: SERVER_HEALTH,
      reuseExistingServer: true,
      timeout: START_TIMEOUT_MS,
    },
    {
      command: 'pnpm --filter @watchparty/web dev',
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: START_TIMEOUT_MS,
    },
  ],
});
