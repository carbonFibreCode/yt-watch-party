import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API_TARGET = 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same origin in dev so the session cookie reaches both REST and WebSocket (LLD SP-23).
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: they rarely change between deploys, so browsers keep them cached.
        manualChunks: (id: string) => {
          if (/node_modules\/\.pnpm\/(react|react-dom|scheduler)@/.test(id)) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/.pnpm/react-router@')) {
            return 'vendor-router';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
