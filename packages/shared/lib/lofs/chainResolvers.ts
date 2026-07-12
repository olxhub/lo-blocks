// packages/shared/lib/lofs/chainResolvers.ts
//
// First-hit resolver chain for OLX parsing. CLIENT-SAFE (no Node imports;
// delegates to whatever providers it's handed).
//
// parseOLX resolves src="" / data="" / cast="" references against a single
// StorageProvider. When content layers over several providers (RenderOLX:
// inline edits over files over a base provider), those layers combine here:
// the chain tries each provider in priority order and the first that owns the
// reference answers.
//
// Only the parse-time surface is implemented — read, resolveRelativePath,
// toLofsRef (what loadExternalSource, assetSrc, and withCastSupport call).
// Everything else on StorageProvider throws: a chain is a parse-resolution
// helper, not a general storage backend. Scans, writes, and listings go
// through the explicit source-set operations (lib/lofs/sourceSet.ts), not here.
//
import type { LofsRef, OlxRelativePath, SafeRelativePath } from '../types';
import type { StorageProvider, ReadResult } from '../types/storage';

const unsupported = (method: string): never => {
  throw new Error(`chainResolvers: ${method} is not supported — a resolver chain only resolves parse-time references`);
};

/**
 * Combine providers into one first-hit resolver for parsing. Priority is list
 * order: earlier providers win. A single provider is returned as-is (no wrapper
 * cost, and its full surface stays available); the empty list is a caller bug.
 */
export function chainResolvers(providers: StorageProvider[]): StorageProvider {
  if (providers.length === 0) {
    throw new Error('chainResolvers requires at least one provider');
  }
  if (providers.length === 1) return providers[0];

  return {
    // Read from the first provider that has the file. Any failure falls through
    // to the next (a lower layer may hold what an upper one lacks); the last
    // error surfaces if none has it — this is parse-time src resolution, where
    // "not in this layer" and "unreadable in this layer" both mean "try next".
    async read(filePath: OlxRelativePath): Promise<ReadResult> {
      let lastError: Error | null = null;
      for (const provider of providers) {
        try {
          return await provider.read(filePath);
        } catch (err) {
          lastError = err as Error;
        }
      }
      throw lastError || new Error(`File not found in any provider: ${filePath}`);
    },

    // Resolve via the provider whose scheme matches the provenance. A
    // non-matching provider throws (wrong scheme / mount), so the right one
    // handles it.
    resolveRelativePath(baseProvenance: LofsRef, relativePath: string): SafeRelativePath {
      for (const provider of providers) {
        try {
          return provider.resolveRelativePath(baseProvenance, relativePath);
        } catch {
          // Continue to next provider.
        }
      }
      throw new Error(`Cannot resolve path in any provider: ${relativePath}`);
    },

    // Construct provenance from the first provider that claims the path,
    // matching read() priority order.
    toLofsRef(safePath: SafeRelativePath): LofsRef {
      for (const provider of providers) {
        try {
          return provider.toLofsRef(safePath);
        } catch {
          // Continue to next provider.
        }
      }
      throw new Error(`Cannot construct provenance in any provider for: ${safePath}`);
    },

    listContent: () => unsupported('listContent'),
    generationToken: () => unsupported('generationToken'),
    commit: () => unsupported('commit'),
    listFiles: () => unsupported('listFiles'),
    glob: () => unsupported('glob'),
    grep: () => unsupported('grep'),
    toRelativePath: () => unsupported('toRelativePath'),
    validateAssetPath: () => unsupported('validateAssetPath'),
    namespaceFor: () => unsupported('namespaceFor'),
  };
}
