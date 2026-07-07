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
    'process.env.LO_BASE_PATH': JSON.stringify(''),
    // Field strategy (fieldTypes/index.ts). null when unset so the module
    // default (crdt) applies; LO_FIELD_STRATEGY=classic is the
    // escape hatch. Without this define the vite client silently saw
    // undefined→classic no matter the environment.
    'process.env.LO_FIELD_STRATEGY':
      JSON.stringify(process.env.LO_FIELD_STRATEGY ?? null),
  },
  optimizeDeps: {
    // Deps reached only through lazy componentLoader chunks (i18next enters
    // via blockI18n.ts inside lazy block components — not the eager graph).
    // Without pre-bundling, Vite discovers them mid-session on first render
    // of the block, re-optimizes, and every already-loaded dep URL 504s
    // ("Outdated Optimize Dep") — dynamic block imports then fail until a
    // hard reload.
    include: [
      'i18next',
      'react-i18next',
      'mathjs',
      'mermaid',
      'katex',
      'liquidjs',
      'dagre',
      'peggy',
      'crypto-js',
      '@observablehq/plot',
      '@xyflow/react',
      '@dicebear/core',
      '@dicebear/open-peeps',
      'codemirror',
      '@uiw/react-codemirror',
      '@codemirror/lang-markdown',
      '@codemirror/lang-xml',
      '@codemirror/lang-yaml',
      'react-split',
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
