import { defineConfig } from 'vitest/config';

const FULL = { lines: 100, functions: 100, branches: 100, statements: 100 };

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/web', 'apps/server/vitest.config.ts', 'apps/server/vitest.db.config.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/test/**'],
      // Coverage floors (rules.md §10.2).
      thresholds: {
        'packages/shared/src/{permissions,playback,youtube,errors}.ts': FULL,
        'apps/server/src/domain/**/*.ts': { lines: 95, functions: 95, branches: 90, statements: 95 },
        'apps/server/src/application/**/*.ts': { lines: 85, functions: 85, branches: 80, statements: 85 },
      },
    },
  },
});
