// packages/shared/lib/lofs/index.ts
//
// Storage abstraction layer - pluggable and stackable content persistence.
//
// Provides a unified interface for accessing learning content from multiple sources:
// - FileStorageProvider: Local filesystem access (server-only)
// - McpStorageProvider: content over the /mcp LOFS tools (client-safe)
// - InMemoryStorageProvider: Virtual filesystem for testing/inline content (client-safe)
// - GitStorageProvider: Version-controlled content (server-only)
//
// Server-only providers use Node.js fs and must be imported directly:
//   import { FileStorageProvider } from '@/lib/lofs/providers/file';
//
// Key property: LAYERING - several sources combine into a read/compile union.
// That union is an explicit per-call operation over a provider list
// (lib/lofs/sourceSet.ts server-side; lib/lofs/chainResolvers.ts for
// parse-time src resolution), not a provider — each source stays addressable
// on its own for origin-scoped editing.
//
// Additional features:
// - Change detection for incremental content updates
// - Security sandbox with path validation and symlink prevention
// - Provenance tracking for debugging and error reporting
// - Image path resolution for media assets
//

// Types
export * from '../types/storage';

// Providers
export * from './providers';

// Other modules
export * from './fileTypes';
