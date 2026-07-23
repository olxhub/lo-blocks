// packages/shared/lib/content/syncContentFromStorage.ts
//
// Content synchronization - loads OLX content from storage into memory.
//
// Maintains two indexes:
// 1. parsedFiles: file URIs -> block IDs parsed from that file + scan metadata
// 2. blockIndex:  block IDs -> language variant map (the idMap)
//
// The sync process:
// 1. Scan storage for added/changed/unchanged/deleted files
// 2. Detect when auxiliary files (e.g., .chatpeg) change, requiring re-parse
//    of dependent OLX
// 3. Remove stale blocks from the index
// 4. Parse new/changed files and update indexes
//
// The core logic lives in applyFileChanges(), which takes a previous snapshot
// and scan result and returns a new snapshot without mutating the old one.
// syncContentFromStorage() is a thin wrapper that manages the module-level
// snapshot and backward-compatible return shape.

import { StorageProvider, fileTypes } from '@/lib/lofs';
import { DocsStorageProvider } from '@/lib/lofs/providers/docs';
import { StackedStorageProvider } from '@/lib/lofs/providers/stacked';
import { unionProvider } from '@/lib/lofs/contentSources';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import type { LofsRef, LofsCanonical, LofsOrigin, OLXLoadingError, OlxJson, IdMap, DefinitionKey, ContentVariant, VariantMap } from '@/lib/types';
import type { XmlFileInfo, XmlScanResult } from '@/lib/types/storage';
import { withoutVersion, addressPath, source } from '@/lib/types/address';
import { variantMapEntries } from '@/lib/types/i18n';
import { toAppError } from '@/lib/types/errors';
import { parseOLX, isAcceptableDuplicate } from '@/lib/content/parseOLX';
import { copyAssetsToPublic } from '@/lib/content/staticAssetSync';
import { linkContent } from '@/lib/content/linkContent';

// =============================================================================
// Types
// =============================================================================

/** A parsed file's entry in the parsedFiles index. */
interface ParsedFileEntry extends XmlFileInfo {
  blockIds: DefinitionKey[];
  /** Parse errors from this file (persists until the file is re-parsed or deleted). */
  errors: OLXLoadingError[];
}

export interface ContentSnapshot {
  readonly parsedFiles: Record<LofsRef, ParsedFileEntry>;
  readonly blockIndex: Record<DefinitionKey, VariantMap>;
}

export const EMPTY_SNAPSHOT: ContentSnapshot = {
  parsedFiles: {},
  blockIndex: {},
};

/** Collect all errors from all parsed files in the snapshot. */
function collectSnapshotErrors(snapshot: ContentSnapshot): OLXLoadingError[] {
  const errors: OLXLoadingError[] = [];
  for (const entry of Object.values(snapshot.parsedFiles)) {
    if (entry.errors.length > 0) {
      errors.push(...entry.errors);
    }
  }
  return errors;
}

// =============================================================================
// Module State
// =============================================================================

let _snapshot: ContentSnapshot = EMPTY_SNAPSHOT;

// =============================================================================
// Query Functions (read from _snapshot)
// =============================================================================

/**
 * Find the source OLX file for a block in a given locale.
 *
 * Returns the block's `source` field (the OLX file it was parsed from),
 * stripped of its version tag.
 */
export function getSourceFile(blockId: DefinitionKey, locale: ContentVariant): LofsRef | null {
  const variantMap = _snapshot.blockIndex[blockId];
  if (!variantMap?.[locale]?.source) return null;

  return withoutVersion(variantMap[locale].source);
}

export function getBlockVariant(blockId: DefinitionKey, locale: ContentVariant): OlxJson | null {
  const variantMap = _snapshot.blockIndex[blockId];
  return variantMap?.[locale] || null;
}

/** Return the first human-authored (non-generated) variant for a block. */
export function getOriginalVariant(blockId: DefinitionKey): OlxJson | null {
  const variantMap = _snapshot.blockIndex[blockId];
  if (!variantMap) return null;
  for (const olxJson of Object.values(variantMap)) {
    if (!olxJson.generated) return olxJson;
  }
  return null;
}

/**
 * Return the full variant map for every block parsed from the given file(s).
 *
 * Accepts multiple URIs to cover both source and translated files - they
 * have different auto-generated child IDs, and the client needs both sets
 * so that whichever variant extractLocalizedVariant picks, its children
 * are available.
 */
export function getBlocksForFiles(...fileUris: LofsRef[]): Record<DefinitionKey, VariantMap> {
  const result: Record<DefinitionKey, VariantMap> = {} as Record<DefinitionKey, VariantMap>;
  for (const fileUri of fileUris) {
    const entry = _snapshot.parsedFiles[fileUri];
    if (!entry) continue;
    for (const blockId of entry.blockIds) {
      if (_snapshot.blockIndex[blockId]) {
        result[blockId] = _snapshot.blockIndex[blockId];
      }
    }
  }
  return result;
}

// =============================================================================
// Internal Helpers
// =============================================================================

function* entriesIdMap(idMap: IdMap): Generator<[DefinitionKey, IdMap[DefinitionKey]]> {
  for (const [id, variants] of Object.entries(idMap)) {
    yield [id as DefinitionKey, variants];
  }
}

function* entriesVariantMap(variantMap: IdMap[DefinitionKey]): Generator<[ContentVariant, OlxJson]> {
  yield* variantMapEntries(variantMap);
}

/** Shallow equality check for VariantMaps: same keys, same value references. */
function variantMapsEqual(a: VariantMap, b: VariantMap): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (a[k as ContentVariant] !== b[k as ContentVariant]) return false;
  }
  return true;
}

// =============================================================================
// Core: apply a set of file changes to produce a new snapshot
// =============================================================================

export async function applyFileChanges(
  prev: ContentSnapshot,
  scan: XmlScanResult,
  provider: StorageProvider,
): Promise<ContentSnapshot> {
  // Step 1: Scan results come in via `scan` parameter

  // Step 2a: A manifest change re-namespaces its whole directory subtree
  const manifestPromoted = promoteFilesAffectedByManifests(scan);

  // Step 2b: Find OLX files that need re-parsing due to auxiliary file changes
  const promoted = promoteFilesWithChangedDependencies(manifestPromoted, prev.blockIndex, prev.parsedFiles);

  // Step 3: Remove blocks from files that are deleted or about to be re-parsed
  const filesToRemove = [
    ...Object.keys(promoted.deleted),
    ...Object.keys(promoted.changed),
  ] as LofsRef[];
  const cleaned = removeBlocksFromFiles(filesToRemove, prev.parsedFiles, prev.blockIndex);

  // Step 4: Parse all new and changed files
  const filesToParse = { ...promoted.added, ...promoted.changed };
  const parsed = await parseAndIndexFiles(filesToParse, cleaned.blockIndex, provider);

  return {
    parsedFiles: { ...cleaned.parsedFiles, ...parsed.parsedFiles },
    blockIndex: { ...cleaned.blockIndex, ...parsed.blockIndex },
  };
}

// =============================================================================
// Main Entry Point (backward-compatible wrapper)
// =============================================================================

/**
 * Default system content sources:
 *   - the deployment's configured content sources (content-sources.yaml:
 *     per-repo checkouts mounted at path prefixes, plus a fallback
 *     directory — see lib/lofs/contentSources.ts; defaults to ./content)
 *   - block documentation examples (per-block docs.* namespaces)
 *
 * Stacked so the whole system content index — including docs — is one
 * sync. This is what lets courses embed documentation content via
 * <Use ref="docs.ActionButton/..."/>.
 */
export async function defaultContentProviders(): Promise<StorageProvider> {
  return new StackedStorageProvider([
    await unionProvider(),
    new DocsStorageProvider(
      Object.values(BLOCK_REGISTRY).filter(b => b?._isBlock).map(b => b.name)
    ),
  ]);
}

export async function syncContentFromStorage(
  provider?: StorageProvider
) {
  provider ??= await defaultContentProviders();
  const scan = await provider.loadXmlFilesWithStats(
    _snapshot.parsedFiles as Record<LofsRef, XmlFileInfo>
  );

  // Steps 1-4 (scan, promote deps, remove stale, parse) happen inside applyFileChanges
  _snapshot = await applyFileChanges(_snapshot, scan, provider);

  // Step 5: Sync static assets
  await copyAssetsToPublic(provider);

  // Step 6: Link the merged snapshot once, over the whole combined index.
  // [pipeline] parse → merge → (ID-finalize: reserved) → linkContent → render
  const { idMap } = linkContent({ ..._snapshot.blockIndex });

  return {
    parsed: { ..._snapshot.parsedFiles },
    idMap,
    errors: collectSnapshotErrors(_snapshot),
  };
}

// =============================================================================
// Dependency Detection
// =============================================================================

/** Is this scan entry a namespace manifest (manifest.yaml)? */
function isManifestUri(uri: LofsRef): boolean {
  return String(addressPath(uri)).split('/').pop() === 'manifest.yaml';
}

/**
 * When a manifest.yaml is added, changed, or deleted, namespaces may change
 * for content beneath it, so affected OLX must re-parse.
 *
 * Why not dependency pointers (OlxJson.manifest), like parseDeps? A pointer
 * can only invalidate content that recorded it. ADDING a manifest — or
 * adding a `namespace:` field to one that declared nothing — affects files
 * that point at nothing: the dependency is on the ABSENCE of a nearer
 * manifest, which a pointer can't express. OlxJson.manifest is provenance,
 * not the invalidation mechanism.
 *
 * The rule is deliberately blunt: any manifest change re-parses every
 * unchanged OLX file in the same mount. Manifest edits are rare and
 * re-parsing is safe; if this is ever too slow, narrow it to the
 * manifest's directory subtree.
 *
 * Returns a new XmlScanResult with affected unchanged OLX moved to "changed".
 */
/** Strip a scan entry to the bare XmlFileInfo, dropping any blockIds a previous
 *  parse attached — they'd be stale once the file is re-parsed. */
function toXmlFileInfo(entry: XmlFileInfo): XmlFileInfo {
  return {
    id: entry.id,
    type: entry.type,
    content: entry.content,
    _metadata: entry._metadata,
  };
}

/** Return a new scan with `uris` moved from "unchanged" to "changed" (as bare
 *  XmlFileInfo). URIs not currently in "unchanged" are skipped. */
function promote(scan: XmlScanResult, uris: Iterable<LofsRef>): XmlScanResult {
  const changed = { ...scan.changed };
  const unchanged = { ...scan.unchanged };
  for (const uri of uris) {
    const entry = unchanged[uri];
    if (!entry) continue;
    changed[uri] = toXmlFileInfo(entry);
    delete unchanged[uri];
  }
  return { added: scan.added, changed, unchanged, deleted: scan.deleted };
}

function promoteFilesAffectedByManifests(scan: XmlScanResult): XmlScanResult {
  const touched = [
    ...Object.keys(scan.added),
    ...Object.keys(scan.changed),
    ...Object.keys(scan.deleted),
  ] as LofsRef[];
  const mounts = new Set(touched.filter(isManifestUri).map(uri => String(source(uri))));
  if (mounts.size === 0) return scan;

  const affected: LofsRef[] = [];
  for (const [uriStr, fileInfo] of Object.entries(scan.unchanged)) {
    const uri = uriStr as LofsRef;
    const isOlx = fileInfo.type === fileTypes.olx || fileInfo.type === fileTypes.xml;
    if (isOlx && mounts.has(String(source(uri)))) affected.push(uri);
  }
  return promote(scan, affected);
}

/**
 * When an auxiliary file (e.g., .chatpeg) changes, any OLX file that references
 * it must be re-parsed. Finds such OLX files in the "unchanged" set and returns
 * a new XmlScanResult with them moved to "changed".
 */
function promoteFilesWithChangedDependencies(
  scan: XmlScanResult,
  blockIndex: Record<DefinitionKey, VariantMap>,
  parsedFiles: Record<LofsRef, ParsedFileEntry>,
): XmlScanResult {
  const changedAuxiliaryFiles = findChangedAuxiliaryFiles(scan);
  if (changedAuxiliaryFiles.size === 0) return scan;

  const olxFilesToReparse = findOlxFilesDependingOn(changedAuxiliaryFiles, blockIndex, scan.unchanged);

  // Also re-parse any unchanged OLX that previously failed — the auxiliary
  // change might fix the missing dependency. Cheap if it fails again.
  for (const [uriStr, fileInfo] of Object.entries(scan.unchanged)) {
    const uri = uriStr as LofsRef;
    const isOlx = fileInfo.type === fileTypes.olx || fileInfo.type === fileTypes.xml;
    const prevEntry = parsedFiles[uri];
    if (isOlx && prevEntry && prevEntry.errors.length > 0) {
      olxFilesToReparse.add(uri);
    }
  }

  if (olxFilesToReparse.size === 0) return scan;
  return promote(scan, olxFilesToReparse);
}

function findChangedAuxiliaryFiles(changeSets: XmlScanResult): Set<LofsRef> {
  const auxiliaryFiles = new Set<LofsRef>();

  const allChangedFiles = [
    ...Object.entries(changeSets.added),
    ...Object.entries(changeSets.changed),
    ...Object.entries(changeSets.deleted),
  ];

  for (const [uri, fileRecord] of allChangedFiles) {
    const isOlxOrXml = fileRecord?.type === fileTypes.olx || fileRecord?.type === fileTypes.xml;
    if (!isOlxOrXml) {
      auxiliaryFiles.add(uri as LofsRef);
    }
  }

  return auxiliaryFiles;
}

function findOlxFilesDependingOn(
  changedAuxiliaryFiles: Set<LofsRef>,
  blockIndex: Record<DefinitionKey, VariantMap>,
  unchangedFiles: Record<LofsRef, XmlFileInfo>
): Set<LofsRef> {
  const olxFilesToReparse = new Set<LofsRef>();

  for (const variantMap of Object.values(blockIndex)) {
    for (const olxJson of Object.values(variantMap)) {
      if (!olxJson?.source) continue;

      const dependsOnChangedFile = olxJson.parseDeps?.some(
        (dep) => changedAuxiliaryFiles.has(withoutVersion(dep))
      );

      if (dependsOnChangedFile) {
        const rootOlxFile = withoutVersion(olxJson.source);
        if (rootOlxFile && unchangedFiles[rootOlxFile]) {
          olxFilesToReparse.add(rootOlxFile);
        }
      }
    }
  }

  return olxFilesToReparse;
}

// =============================================================================
// Block Removal
// =============================================================================

/**
 * Remove variants that came from the given files.
 *
 * Variant-aware: if foo.en.olx and foo.es.olx both define activity_1,
 * removing foo.en.olx drops only the English variant, not the Spanish one.
 * A block is deleted entirely only when no variants remain.
 */
function removeBlocksFromFiles(
  fileUris: LofsRef[],
  parsedFiles: Record<LofsRef, ParsedFileEntry>,
  blockIndex: Record<DefinitionKey, VariantMap>,
): { parsedFiles: Record<LofsRef, ParsedFileEntry>; blockIndex: Record<DefinitionKey, VariantMap> } {
  const urisToRemove = new Set<LofsRef>(fileUris);

  // Collect block IDs that MIGHT need variants removed
  const candidateIds = new Set<DefinitionKey>();
  for (const fileUri of fileUris) {
    const parsedFile = parsedFiles[fileUri];
    if (parsedFile?.blockIds) {
      for (const blockId of parsedFile.blockIds) {
        candidateIds.add(blockId);
      }
    }
  }

  const newBlockIndex: Record<DefinitionKey, VariantMap> = {} as Record<DefinitionKey, VariantMap>;
  for (const [id, variants] of Object.entries(blockIndex)) {
    const key = id as DefinitionKey;
    if (!candidateIds.has(key)) {
      // Block not from any removed file — keep as-is
      newBlockIndex[key] = variants;
      continue;
    }

    // Filter out variants whose source matches a removed file
    const kept: VariantMap = {} as VariantMap;
    for (const [lang, olxJson] of entriesVariantMap(variants)) {
      const variantSource = withoutVersion(olxJson.source);
      if (!urisToRemove.has(variantSource)) {
        kept[lang] = olxJson;
      }
    }

    // Keep the block only if it still has variants
    if (Object.keys(kept).length > 0) {
      newBlockIndex[key] = kept;
    }
  }

  const newParsedFiles: Record<LofsRef, ParsedFileEntry> = {} as Record<LofsRef, ParsedFileEntry>;
  for (const [uri, entry] of Object.entries(parsedFiles)) {
    if (!urisToRemove.has(uri as LofsRef)) {
      newParsedFiles[uri as LofsRef] = entry;
    }
  }

  return { parsedFiles: newParsedFiles, blockIndex: newBlockIndex };
}

// =============================================================================
// Parsing
// =============================================================================

async function parseAndIndexFiles(
  filesToParse: Record<LofsRef, XmlFileInfo>,
  existingBlockIndex: Record<DefinitionKey, VariantMap>,
  provider: StorageProvider,
): Promise<{
  parsedFiles: Record<LofsRef, ParsedFileEntry>;
  blockIndex: Record<DefinitionKey, VariantMap>;
}> {
  const newParsedFiles: Record<LofsRef, ParsedFileEntry> = {} as Record<LofsRef, ParsedFileEntry>;
  const newBlockIndex: Record<DefinitionKey, VariantMap> = {} as Record<DefinitionKey, VariantMap>;

  for (const [fileUri, fileRecord] of Object.entries(filesToParse) as [LofsRef, XmlFileInfo][]) {
    // Non-OLX files (auxiliary files like .chatpeg) are tracked for change
    // detection but not parsed for blocks.
    if (fileRecord.type !== fileTypes.olx && fileRecord.type !== fileTypes.xml) {
      newParsedFiles[fileUri] = {
        ...fileRecord,
        blockIds: [],
        errors: [],
      };
      continue;
    }

    try {
      // The provider owns namespace resolution (manifest override, then a
      // provider-specific fallback like the top-level directory). A file
      // with no resolvable namespace throws here and becomes a file_error.
      // Manifest edits invalidate their subtree via
      // promoteFilesAffectedByManifests (step 2a in applyFileChanges).
      const { ns, manifest } = await provider.namespaceFor(fileRecord.id);
      const parseResult = await parseOLX(fileRecord.content, [fileRecord.id], provider, ns);
      const fileErrors: OLXLoadingError[] = parseResult.errors ?? [];

      // Namespace provenance: record which manifest declared this content's
      // namespace. (Stamped here, not in parseOLX — only the provider knows
      // where the namespace came from.)
      if (manifest) {
        for (const variants of Object.values(parseResult.idMap)) {
          for (const olxJson of Object.values(variants) as OlxJson[]) {
            olxJson.manifest = manifest;
          }
        }
      }

      // Build a combined view for duplicate detection. Deep-copy VariantMaps
      // so indexParsedBlocks mutations don't leak back to existingBlockIndex.
      const mergedView: Record<DefinitionKey, VariantMap> = {} as Record<DefinitionKey, VariantMap>;
      for (const [id, vm] of Object.entries({ ...existingBlockIndex, ...newBlockIndex })) {
        mergedView[id as DefinitionKey] = { ...vm };
      }
      indexParsedBlocks(parseResult.idMap, mergedView, fileRecord.id, fileErrors);
      for (const [id, variants] of Object.entries(mergedView)) {
        const key = id as DefinitionKey;
        if (!(key in existingBlockIndex) || !variantMapsEqual(variants, existingBlockIndex[key])) {
          newBlockIndex[key] = variants;
        }
      }

      newParsedFiles[fileUri] = {
        ...fileRecord,
        blockIds: parseResult.ids,
        errors: fileErrors,
      };

    } catch (fatalError: any) {
      console.error(`\n❌ DETAILED ERROR for ${fileUri}:`);
      console.error('Message:', fatalError.message);
      console.error('Stack trace:', fatalError.stack);

      newParsedFiles[fileUri] = {
        ...fileRecord,
        blockIds: [],
        errors: [{
          type: 'file_error',
          title: `${fileUri} could not be loaded`,
          message: `Failed to parse file: ${fatalError.message}`,
          location: { provenance: [fileRecord.id] },
          technical: toAppError(fatalError),
          stack: fatalError.stack,
        }],
      };
    }
  }

  return { parsedFiles: newParsedFiles, blockIndex: newBlockIndex };
}

/**
 * Merge parsed blocks into the block index, merging language variants.
 *
 * Same block ID across files is allowed if they have different languages.
 * Duplicate error only if: same ID + same language in different files,
 * UNLESS the block is stateless (requiresUniqueId: false) and content-identical.
 *
 * Mutates blockIndex (caller provides a working copy).
 */
function indexParsedBlocks(
  newBlocks: IdMap,
  blockIndex: Record<DefinitionKey, VariantMap>,
  sourceFile: LofsCanonical,
  errors: OLXLoadingError[]
): void {
  for (const [blockId, newVariantMap] of entriesIdMap(newBlocks)) {
    const existingBlock = blockIndex[blockId];

    if (!existingBlock) {
      blockIndex[blockId] = newVariantMap;
      continue;
    }

    for (const [lang, newOlxJson] of entriesVariantMap(newVariantMap)) {
      if (existingBlock[lang]) {
        if (isAcceptableDuplicate(existingBlock[lang], newOlxJson)) {
          continue;  // Identical stateless block across files
        }
        // Two blocks claim the same identity. If they come from different
        // sources, it's a collision between independently-authored courses
        // (the "two psych courses both define memphis/operant" case) — a
        // different problem, with different advice, than an in-source dup.
        const existingOrigin = source(existingBlock[lang].source);
        const newOrigin = source(newOlxJson.source);
        errors.push(existingOrigin === newOrigin
          ? createDuplicateIdError(blockId, existingBlock[lang], newOlxJson, sourceFile)
          : createSourceCollisionError(blockId, existingBlock[lang], existingOrigin, newOrigin));
        continue;  // Keep the first one
      }

      // New language for this ID - merge it in
      existingBlock[lang] = newOlxJson;
    }
  }
}

/**
 * Two different sources both define the same identity. Unlike an in-source
 * duplicate, the fix isn't "rename your IDs" — it's that two independently
 * authored courses can't both mount the same namespace at once. The compiler
 * keeps the first and reports the clash so the author can subscribe to one or
 * give them distinct namespaces.
 */
function createSourceCollisionError(
  blockId: DefinitionKey,
  existingBlock: OlxJson,
  existingOrigin: LofsOrigin,
  newOrigin: LofsOrigin,
): OLXLoadingError {
  return {
    type: 'source_collision',
    title: `"${blockId}" defined by two sources`,
    location: { provenance: [existingBlock.source] },
    message: `"${blockId}" is defined by two different sources:

   ${existingOrigin}  (kept)
   ${newOrigin}  (ignored)

These look like independently authored courses claiming the same identity. \
They can't both mount here. Subscribe to one, or give them distinct namespaces.`,
    technical: { blockId, existingOrigin, newOrigin },
  };
}

function createDuplicateIdError(
  blockId: DefinitionKey,
  existingBlock: OlxJson,
  duplicateBlock: OlxJson,
  sourceFile: LofsCanonical
): OLXLoadingError {
  // TODO: We'd love to print line/column, but OlxJson only carries
  // _sourceOffset (byte offset) which needs the original XML to convert.
  // See the OPEN QUESTION on _sourceOffset in lib/types/core.ts.
  const existingFile = existingBlock.source ?? 'unknown';
  const existingOffset = existingBlock._sourceOffset ?? '?';
  const duplicateOffset = duplicateBlock._sourceOffset ?? '?';
  return {
    type: 'duplicate_id',
    title: `Duplicate ID "${blockId}" in ${sourceFile}`,
    location: { provenance: [sourceFile] },
    message: `Duplicate ID "${blockId}" found in ${sourceFile} (conflicts with entry from another file)

🔍 EXISTING ENTRY (from different file):
   File: ${existingFile}
   Byte offset: ${existingOffset}
   Tag: <${existingBlock.tag || 'unknown'}>
   Attributes: ${JSON.stringify(existingBlock.attributes || {}, null, 2)}
   Content: ${existingBlock.kids ?? 'N/A'}

🔍 DUPLICATE ENTRY (in current file ${sourceFile}):
   Byte offset: ${duplicateOffset}
   Tag: <${duplicateBlock.tag || 'unknown'}>
   Attributes: ${JSON.stringify(duplicateBlock.attributes || {}, null, 2)}
   Content: ${duplicateBlock.kids ?? 'N/A'}

💡 TIP: IDs must be unique across ALL files in the project. Use different id attributes or prefixes for each file.`,
    technical: {
      duplicateId: blockId,
      existingEntry: existingBlock,
      duplicateEntry: duplicateBlock
    }
  };
}
