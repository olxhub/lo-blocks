// apps/static/vite.config.ts
//
// Vite build configuration for static exports. Produces a single JS/CSS
// bundle in dist/. A post-build stamp script (scripts/stamp-pages.ts)
// reads the manifest and stamps out one index.html per route.
//
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';

const basePath = process.env.STATIC_BASE_PATH || '';

// Read static.config.json for build-time settings (eventServerUrl, etc.)
const staticConfigPath = path.resolve(__dirname, '../../content/static.config.json');
const staticConfig: Record<string, unknown> = fs.existsSync(staticConfigPath)
  ? JSON.parse(fs.readFileSync(staticConfigPath, 'utf-8'))
  : {};

// Read system.pmss for build-time PMSS injection
const systemPmss = fs.readFileSync(
  path.resolve(__dirname, '../../config/system.pmss'), 'utf-8'
);

export default defineConfig({
  root: path.resolve(__dirname),
  base: basePath || '/',
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../packages/shared'),
    },
  },
  define: {
    'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify(basePath),
    '__STATIC_EVENT_SERVER_URL__': JSON.stringify(staticConfig.eventServerUrl || ''),
    '__STATIC_CLASSES__': JSON.stringify(staticConfig.classes || []),
    '__SYSTEM_PMSS__': JSON.stringify(systemPmss),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
