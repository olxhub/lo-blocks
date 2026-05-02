// src/lib/content/contentIndex.ts
//
// ContentIndex - namespace-aware OlxJson-level content access.
//
// Wraps syncContentFromStorage with namespace awareness and provides
// block-level CRUD operations. This is the API that /api/olxjson/ routes,
// blocks, and the MCP server use to access parsed content.
//
// Currently single-namespace (delegates to syncContentFromStorage's global store).
// Multi-namespace support: each namespace gets its own sync state. This will
// be implemented when cross-namespace references are first used.
//
import type { IdMap, OlxKey, VariantMap, ContentVariant, OlxJson, OLXLoadingError } from '../types';
import type { ContentNamespace, StorageProvider } from '../types/storage';
import { getStorageManager } from '../lofs/storageManager';
import {
  syncContentFromStorage,
  getBlockVariant,
  getOriginalVariant,
  getSourceFile,
  getBlocksForFiles,
} from './syncContentFromStorage';

// =============================================================================
// Types
// =============================================================================

export interface SyncResult {
  idMap: IdMap;
  errors: OLXLoadingError[];
}

/**
 * ContentIndex provides namespace-aware access to parsed OLX content.
 *
 * For the PoC, this is a thin facade over syncContentFromStorage.
 * The interface is designed for future multi-namespace support.
 */
export class ContentIndex {
  /**
   * Sync content from storage for a namespace.
   * Scans for changes, parses new/modified files, updates indexes.
   */
  async sync(ns?: ContentNamespace): Promise<SyncResult> {
    const provider = this.getProvider(ns);
    const result = await syncContentFromStorage(provider);
    return {
      idMap: result.idMap,
      errors: result.errors,
    };
  }

  /**
   * Get the full IdMap for a namespace.
   * Calls sync() if needed to ensure content is up to date.
   */
  async getIdMap(ns?: ContentNamespace): Promise<IdMap> {
    const { idMap } = await this.sync(ns);
    return idMap;
  }

  /**
   * Get a specific block's variant map.
   * Returns null if the block doesn't exist.
   */
  getBlock(id: OlxKey, _ns?: ContentNamespace): VariantMap | null {
    // Currently delegates to the global content store.
    // The ns parameter is reserved for future multi-namespace support.
    const variant = getBlockVariant(id, '*' as ContentVariant);
    if (variant) {
      // Return the full variant map by getting blocks for the block's source file
      const allVariants: VariantMap = {};
      // Try common variants
      for (const v of ['*', 'en', 'en-Latn-US'] as ContentVariant[]) {
        const vBlock = getBlockVariant(id, v);
        if (vBlock) allVariants[v] = vBlock;
      }
      return Object.keys(allVariants).length > 0 ? allVariants : null;
    }
    return null;
  }

  /**
   * Get the first non-generated (human-authored) variant for a block.
   */
  getOriginalVariant(id: OlxKey, _ns?: ContentNamespace): OlxJson | null {
    return getOriginalVariant(id);
  }

  /**
   * Find which file a block was parsed from.
   */
  getSourceFile(id: OlxKey, locale: ContentVariant, _ns?: ContentNamespace) {
    return getSourceFile(id, locale);
  }

  /**
   * Get all blocks parsed from specific file(s).
   */
  getBlocksForFiles(...fileUris: string[]) {
    return getBlocksForFiles(...fileUris as any);
  }

  /**
   * Get the storage provider for a namespace.
   */
  getProvider(ns?: ContentNamespace): StorageProvider {
    return getStorageManager().getProvider(ns);
  }

  // TODO: writeBlock(id, variant, olxJson) — serialize OlxJson to OLX and write to storage.
  // This requires OlxJson → OLX serialization which is non-trivial (round-trip fidelity).
  // Defer to a follow-up.
}

// =============================================================================
// Singleton
// =============================================================================

let _index: ContentIndex | null = null;

export function getContentIndex(): ContentIndex {
  if (!_index) _index = new ContentIndex();
  return _index;
}

/** Reset for testing. */
export function resetContentIndex(): void {
  _index = null;
}
