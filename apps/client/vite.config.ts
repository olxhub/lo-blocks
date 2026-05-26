// apps/client/vite.config.ts
//
// Build configuration for the client SPA. Vite is used purely as a build
// tool — the app server (apps/server) serves the output from dist/.
//
// Dev workflow: `vite build --watch apps/client` rebuilds on save,
// the server picks up new files on the next request.
//
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  base: '/',
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../packages/shared'),
    },
  },
  define: {
    'process.env.NEXT_PUBLIC_APP_PROFILE': JSON.stringify('client'),
    'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify(''),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
