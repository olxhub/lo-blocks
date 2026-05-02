// src/lib/lofs/serverInit.ts
//
// Server-side storage initialization.
//
// Call initServerStorage() once at server startup (e.g., from Next.js
// instrumentation.ts) to configure the global StorageManager with the
// appropriate providers for the current environment.
//
// This is the single place where the provider stack is composed.
// API routes then use getStorageManager().getDefaultProvider() instead
// of hardcoding new FileStorageProvider('./content').
//
import { initStorage } from './storageManager';
import { toContentNamespace } from '../types/storage';
import { FileStorageProvider } from './providers/file';

/**
 * Initialize storage for the server environment.
 *
 * Default configuration:
 * - "local" namespace → FileStorageProvider at ./content (or OLX_CONTENT_DIR)
 * - "docs"  namespace → FileStorageProvider at block/grammar directories (read-only)
 *
 * Future: add git, postgres namespaces based on environment config.
 */
export function initServerStorage(): void {
  const contentDir = process.env.OLX_CONTENT_DIR || './content';

  initStorage({
    defaultNamespace: toContentNamespace('local'),
    namespaces: {
      local: [new FileStorageProvider(contentDir, 'content', 'local')],
      docs: [new FileStorageProvider('./packages/shared/components/blocks', 'blocks', 'docs')],
    },
  });
}
