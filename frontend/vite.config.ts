import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_API_TARGET || 'http://127.0.0.1:5000';
// Set VITE_HMR_TLS=true only when the dev server is reached through a TLS
// proxy on port 443. Left off, Vite derives the HMR socket from the page URL,
// which is correct for both plain http://localhost:5173 and a proxied host.
const HMR_OVER_TLS = process.env.VITE_HMR_TLS === 'true';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Allow the sandboxed preview host (https://<port>-<id>.e2b.app)
    allowedHosts: true,
    cors: true,
    ...(HMR_OVER_TLS ? { hmr: { clientPort: 443, protocol: 'wss' as const } } : {}),
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/health': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
