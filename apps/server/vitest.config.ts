import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.pg.test.ts'],
  },
});
