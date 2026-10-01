import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API_TARGET = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in dev so the session cookie reaches both REST and WebSocket (LLD SP-23).
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
  test: {
    name: 'web',
    environment: 'node',
  },
});
