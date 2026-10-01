import { defineConfig } from 'vitest/config';

const FULL = { lines: 100, functions: 100, branches: 100, statements: 100 };

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/test/**'],
      // Coverage floors (rules.md §10.2).
      thresholds: {
        'packages/shared/src/{permissions,playback,youtube,errors}.ts': FULL,
      },
    },
  },
});
