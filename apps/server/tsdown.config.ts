import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared package is TypeScript source, so it must be bundled; real npm deps stay external.
  deps: { alwaysBundle: ['@watchparty/shared'] },
});
