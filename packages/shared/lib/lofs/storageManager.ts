// src/lib/lofs/storageManager.ts
//
// StorageManager - central configuration and composition of storage providers.
//
// Replaces hardcoded `new FileStorageProvider('./content')` in API routes with
// a configurable singleton that maps content namespaces to provider stacks.
//
// Usage:
//   // At server startup:
//   initStorage({
//     defaultNamespace: toContentNamespace('local'),
//     namespaces: {
//       'local': [new FileStorageProvider('./content', 'content')],
//       'docs': [new FileStorageProvider('./packages/shared/components/blocks', 'blocks')],
//     },
//   });
//
//   // In API routes:
//   const provider = getStorageManager().getDefaultProvider();
//   const content = await provider.read(path);
//
import type { StorageProvider, ContentNamespace } from './types';
import { toContentNamespace } from './types';
import { StackedStorageProvider } from './providers/stacked';

/**
 * Configuration for the storage manager.
 * Maps namespaces to ordered provider arrays (highest priority first).
 */
export interface StorageManagerConfig {
  /** Default namespace for unqualified references. */
  defaultNamespace: ContentNamespace;
  /** Provider stack per namespace. Each array is wrapped in StackedStorageProvider. */
  namespaces: Record<string, StorageProvider[]>;
}

export class StorageManager {
  private config: StorageManagerConfig;
  private stacks: Map<ContentNamespace, StorageProvider> = new Map();

  constructor(config: StorageManagerConfig) {
    this.config = config;

    // Build stacked providers for each namespace
    for (const [ns, providers] of Object.entries(config.namespaces)) {
      const namespace = toContentNamespace(ns);
      if (providers.length === 1) {
        // Single provider — no stacking needed
        this.stacks.set(namespace, providers[0]);
      } else {
        this.stacks.set(namespace, new StackedStorageProvider(providers, ns));
      }
    }
  }

  /** Get the composed provider for a namespace. */
  getProvider(ns?: ContentNamespace): StorageProvider {
    const namespace = ns ?? this.config.defaultNamespace;
    const provider = this.stacks.get(namespace);
    if (!provider) {
      throw new Error(
        `No storage provider configured for namespace "${namespace}". ` +
        `Available: ${this.listNamespaces().join(', ')}`
      );
    }
    return provider;
  }

  /** Get the default provider (for the primary namespace). */
  getDefaultProvider(): StorageProvider {
    return this.getProvider(this.config.defaultNamespace);
  }

  /** The default namespace. */
  get defaultNamespace(): ContentNamespace {
    return this.config.defaultNamespace;
  }

  /** List all configured namespaces. */
  listNamespaces(): ContentNamespace[] {
    return Array.from(this.stacks.keys());
  }
}

// =============================================================================
// Singleton
// =============================================================================
//
// Uses globalThis to survive module re-instantiation across bundle boundaries.
// In Next.js with Turbopack, the instrumentation hook and API routes may load
// separate copies of this module — a module-level `let` would be invisible
// across those copies. globalThis is shared across all server-side code.

const GLOBAL_KEY = '__lofsStorageManager' as const;

declare global {
  // eslint-disable-next-line no-var
  var __lofsStorageManager: StorageManager | undefined;
}

/**
 * Initialize the global StorageManager. Call once at server startup.
 * Calling again replaces the previous configuration (useful for tests).
 */
export function initStorage(config: StorageManagerConfig): void {
  globalThis[GLOBAL_KEY] = new StorageManager(config);
}

/**
 * Get the global StorageManager.
 * Throws if initStorage() hasn't been called.
 */
export function getStorageManager(): StorageManager {
  const mgr = globalThis[GLOBAL_KEY];
  if (!mgr) {
    throw new Error(
      'StorageManager not initialized. Call initStorage() at server startup.'
    );
  }
  return mgr;
}

/**
 * Reset the global StorageManager (for testing only).
 */
export function resetStorage(): void {
  globalThis[GLOBAL_KEY] = undefined;
}
