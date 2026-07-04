// apps/client/vite.config.ts
//
// Vite configuration for the client SPA, used two ways:
//
// - Dev: apps/server mounts Vite as dev middleware (middlewareMode, this
//   config file) — modules transform on demand with HMR; no build step.
// - Prod: `npm run build:client` bundles to dist/, which apps/server
//   serves when NODE_ENV=production.
//
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'node:url';

// import.meta.url, not __dirname: apps/server imports this file directly
// (via tsx) for dev middleware, where no CJS __dirname shim exists.
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  base: '/',
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(here, '../../packages/shared'),
    },
  },
  define: {
    'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify(''),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
