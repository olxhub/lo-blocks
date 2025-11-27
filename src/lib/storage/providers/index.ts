// src/lib/storage/providers/index.ts
//
// Re-exports storage provider implementations.
//
// NOTE: FileStorageProvider, GitStorageProvider, and PostgresStorageProvider
// are server-only (they use Node.js fs). Import them directly:
//   import { FileStorageProvider } from '@/lib/storage/providers/file';
//
export { NetworkStorageProvider, type NetworkProviderOptions } from './network';
export { InMemoryStorageProvider } from './memory';
