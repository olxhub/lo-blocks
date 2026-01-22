// s../lib/lofs/index.ts
//
// Storage abstraction layer - pluggable and stackable content persistence.
//
// Provides a unified interface for accessing learning content from multiple sources:
// - FileStorageProvider: Local filesystem access (server-only)
// - NetworkStorageProvider: HTTP-based content APIs (client-safe)
// - InMemoryStorageProvider: Virtual filesystem for testing/inline content (client-safe)
// - GitStorageProvider: Version-controlled content (server-only, planned)
// - PostgresStorageProvider: Database-backed content (server-only, planned)
//
// Server-only providers use Node.js fs and must be imported directly:
//   import { FileStorageProvider } from '@/lib/lofs/providers/file';
//
// Key property: STACKING - Storage providers can overlay on each other, enabling
// workflows like: local development content → university database → platform content.
// Developers can work locally with git/file storage while overlaying and pushing
// to institutional databases that reference shared platform content.
//
// Additional features:
// - Change detection for incremental content updates
// - Security sandbox with path validation and symlink prevention
// - Provenance tracking for debugging and error reporting
// - Image path resolution for media assets
//

// Types
export * from './types';

// Providers
export * from './providers';

// Other modules
export * from './fileTypes';
export * from './provenance';
