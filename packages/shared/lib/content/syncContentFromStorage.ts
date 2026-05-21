// src/lib/content/syncContentFromStorage.ts
//
// Content synchronization - loads OLX content from storage into memory.
//
// This module maintains two indexes:
// 1. parsedFiles: Maps file URIs to their parsed block IDs and metadata
// 2. blockIndex: Maps block IDs to their parsed block data
//
// The sync process:
// 1. Scan storage for added/changed/unchanged/deleted files
// 2. Detect when auxiliary files (e.g., .chatpeg) change, requiring re-parse of dependent OLX
// 3. Remove stale blocks from the index
// 4. Parse new/changed files and update indexes
//

import { StorageProvider, fileTypes } from '@/lib/lofs';
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import type { LofsRef, LofsCanonical, OLXLoadingError, OlxJson, IdMap, DefinitionKey, ContentVariant, VariantMap } from '@/lib/types';
import type { XmlFileInfo, XmlScanResult } from '@/lib/types/storage';
import { withoutVersion } from '@/lib/types/address';
import { variantMapEntries } from '@/lib/types/i18n';
import { parseOLX, blockRequiresUniqueId } from '@/lib/content/parseOLX';
import { copyAssetsToPublic } from '@/lib/content/staticAssetSync';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { stableStringify } from '@/lib/util';

// =============================================================================
// Types
// =============================================================================

/**
 * A parsed file's entry in the parsedFiles index.
 * Extends XmlFileInfo with parsing results.
 */
interface ParsedFileEntry extends XmlFileInfo {
  blockIds: DefinitionKey[];  // IDs of blocks parsed from this file
  error?: string;      // Set if parsing failed
}


// =============================================================================
// Block Lookup (used by translate endpoint to find source files)
// =============================================================================

/**
 * Find the source OLX file for a block in a given locale.
 *
 * Walks the block's provenance chain and returns the first entry that
 * is a parsed OLX/XML file. This avoids depending on provenance ordering —
 * the check is "which provenance entry is an OLX file we parsed?"
 *
 * Returns a file:// URI, or null if the block/locale doesn't exist.
 */
export function getSourceFile(blockId: DefinitionKey, locale: ContentVariant): LofsRef | null {
  const variantMap = contentStore.blockIndex[blockId];
  if (!variantMap?.[locale]?.provenance) return null;

  for (const prov of variantMap[locale].provenance) {
    // Provenance entries are LofsCanonical (may have @version); parsedFiles is keyed
    // by unversioned LofsRef. Strip version for lookup.
    const key = withoutVersion(prov);
    const entry = contentStore.parsedFiles[key];
    if (entry && (entry.type === fileTypes.olx || entry.type === fileTypes.xml)) {
      return key;
    }
  }
  return null;
}

/**
 * Return the OlxJson for a specific block + locale from the content store.
 * Returns null if the block or locale variant doesn't exist.
 */
export function getBlockVariant(blockId: DefinitionKey, locale: ContentVariant): OlxJson | null {
  const variantMap = contentStore.blockIndex[blockId];
  return variantMap?.[locale] || null;
}

/**
 * Return the first human-authored (non-generated) variant for a block.
 * Used to find the original source variant when starting from a translation.
 * Returns null if no variants exist or all are generated.
 */
export function getOriginalVariant(blockId: DefinitionKey): OlxJson | null {
  const variantMap = contentStore.blockIndex[blockId];
  if (!variantMap) return null;
  for (const olxJson of Object.values(variantMap)) {
    if (!olxJson.generated) return olxJson;
  }
  return null;
}

/**
 * Return the full variant map for every block parsed from the given file(s).
 *
 * Accepts multiple URIs to cover both source and translated files — they
 * have different auto-generated child IDs, and the client needs both sets
 * so that whichever variant extractLocalizedVariant picks, its children
 * are available.
 */
export function getBlocksForFiles(...fileUris: LofsRef[]): Record<DefinitionKey, VariantMap> {
  const result: Record<DefinitionKey, VariantMap> = {} as Record<DefinitionKey, VariantMap>;
  for (const fileUri of fileUris) {
    const entry = contentStore.parsedFiles[fileUri];
    if (!entry) continue;
    for (const blockId of entry.blockIds) {
      if (contentStore.blockIndex[blockId]) {
        result[blockId] = contentStore.blockIndex[blockId];
      }
    }
  }
  return result;
}

// =============================================================================
// Internal Types and Helpers
// =============================================================================

/** Typed iteration over IdMap entries (Object.entries loses branded key types) */
function* entriesIdMap(idMap: IdMap): Generator<[DefinitionKey, IdMap[DefinitionKey]]> {
  for (const [id, variants] of Object.entries(idMap)) {
    yield [id as DefinitionKey, variants];
  }
}

/** Typed iteration over variant map entries */
function* entriesVariantMap(variantMap: IdMap[DefinitionKey]): Generator<[ContentVariant, OlxJson]> {
  yield* variantMapEntries(variantMap);
}

/** The in-memory content store */
interface ContentStore {
  /** Maps file URI -> parsed file entry (what blocks came from this file) */
  parsedFiles: Record<LofsRef, ParsedFileEntry>;
  /** Maps block ID -> language variant map (the actual parsed content) */
  blockIndex: Record<DefinitionKey, VariantMap>;
}

// =============================================================================
// Module State
// =============================================================================

const contentStore: ContentStore = {
  parsedFiles: {},
  blockIndex: {}
};

// =============================================================================
// Main Entry Point
// =============================================================================

export async function syncContentFromStorage(
  provider: StorageProvider = new FileStorageProvider('./content')
) {
  // Step 1: Get file change sets from storage
  const changeSets = await provider.loadXmlFilesWithStats(
    contentStore.parsedFiles as Record<LofsRef, XmlFileInfo>
  );

  // Step 2: Find OLX files that need re-parsing due to auxiliary file changes
  promoteFilesWithChangedDependencies(changeSets, contentStore.blockIndex);

  // Step 3: Remove blocks from files that are deleted or about to be re-parsed
  const filesToRemove = [
    ...Object.keys(changeSets.deleted),
    ...Object.keys(changeSets.changed)
  ] as LofsRef[];
  removeBlocksFromFiles(filesToRemove, contentStore);

  // Step 4: Parse all new and changed files
  const filesToParse = { ...changeSets.added, ...changeSets.changed };
  const errors = await parseAndIndexFiles(filesToParse, contentStore, provider);

  // Step 5: Sync static assets
  await copyAssetsToPublic(provider);

  // Return with legacy property names for backward compatibility
  // Internally we use: parsedFiles/blockIds, externally: parsed/nodes/idMap
  const parsed = Object.fromEntries(
    Object.entries(contentStore.parsedFiles).map(([uri, entry]) => [
      uri,
      { ...entry, nodes: entry.blockIds }  // Alias blockIds as nodes
    ])
  );

  return {
    parsed,
    idMap: contentStore.blockIndex,
    errors
  };
}

// =============================================================================
// Step 2: Dependency Detection
// =============================================================================

/**
 * When an auxiliary file (e.g., .chatpeg) changes, any OLX file that references
 * it must be re-parsed. This function finds such OLX files in the "unchanged"
 * set and moves them to "changed".
 */
function promoteFilesWithChangedDependencies(
  changeSets: XmlScanResult,
  blockIndex: Record<DefinitionKey, VariantMap>,
): void {
  const changedAuxiliaryFiles = findChangedAuxiliaryFiles(changeSets);
  if (changedAuxiliaryFiles.size === 0) return;

  const olxFilesToReparse = findOlxFilesDependingOn(changedAuxiliaryFiles, blockIndex, changeSets.unchanged);

  for (const olxUri of olxFilesToReparse) {
    moveUnchangedToChanged(olxUri, changeSets);
  }
}

/** Returns URIs of non-OLX/XML files that were added, changed, or deleted */
function findChangedAuxiliaryFiles(changeSets: XmlScanResult): Set<LofsRef> {
  const auxiliaryFiles = new Set<LofsRef>();

  const allChangedFiles = [
    ...Object.entries(changeSets.added),
    ...Object.entries(changeSets.changed),
    ...Object.entries(changeSets.deleted)
  ];

  for (const [uri, fileRecord] of allChangedFiles) {
    const isOlxOrXml = fileRecord?.type === fileTypes.olx || fileRecord?.type === fileTypes.xml;
    if (!isOlxOrXml) {
      auxiliaryFiles.add(uri as LofsRef);
    }
  }

  return auxiliaryFiles;
}

/**
 * Finds OLX files that depend on any of the changed auxiliary files.
 * A dependency is detected by checking if any block's provenance chain
 * includes the auxiliary file.
 */
function findOlxFilesDependingOn(
  changedAuxiliaryFiles: Set<LofsRef>,
  blockIndex: Record<DefinitionKey, VariantMap>,
  unchangedFiles: Record<LofsRef, XmlFileInfo>
): Set<LofsRef> {
  const olxFilesToReparse = new Set<LofsRef>();

  for (const variantMap of Object.values(blockIndex)) {
    // blockIndex stores nested structure { variant: OlxJson }
    // Check ALL variants for dependencies on changed auxiliary files
    // (e.g., Arabic variant might include src="aux.ar.png" that English doesn't)
    for (const olxJson of Object.values(variantMap)) {
      if (!olxJson?.provenance || !Array.isArray(olxJson.provenance)) continue;

      // Check if this variant's provenance includes a changed auxiliary file.
      // Provenance entries are LofsCanonical (may have @version); auxiliary file keys
      // are unversioned LofsRef. Strip version for comparison.
      const dependsOnChangedFile = olxJson.provenance.some(
        (prov) => changedAuxiliaryFiles.has(withoutVersion(prov))
      );

      if (dependsOnChangedFile) {
        // The root OLX file is the first element in the provenance list.
        // Strip version to match against unversioned Record keys.
        const rootOlxFile = withoutVersion(olxJson.provenance[0]);
        if (rootOlxFile && unchangedFiles[rootOlxFile]) {
          olxFilesToReparse.add(rootOlxFile);
        }
      }
    }
  }

  return olxFilesToReparse;
}

/**
 * Moves a file from unchanged to changed for re-parsing.
 *
 * The file itself hasn't changed (it's in "unchanged"), but a dependency
 * (e.g., a .chatpeg it references) changed, so the OLX needs re-parsing.
 * Content comes from the previous scan — no re-read needed.
 *
 * IMPORTANT: We copy only the metadata, not the old blockIds.
 * The old entry may have blockIds from a previous parse, but we don't
 * want those carried into the changed set - fresh blockIds will be
 * set after re-parsing.
 */
function moveUnchangedToChanged(
  fileUri: LofsRef,
  changeSets: XmlScanResult,
): void {
  const existingEntry = changeSets.unchanged[fileUri];
  if (!existingEntry) return;

  // Copy only XmlFileInfo fields — strip blockIds from previous parse
  const fileRecord: XmlFileInfo = {
    id: existingEntry.id,
    type: existingEntry.type,
    content: existingEntry.content,
    _metadata: existingEntry._metadata
  };

  changeSets.changed[fileUri] = fileRecord;
  delete changeSets.unchanged[fileUri];
}

// =============================================================================
// Step 3: Block Removal
// =============================================================================

/**
 * Removes all blocks that were parsed from the given files.
 * This cleans up the blockIndex before re-parsing.
 */
function removeBlocksFromFiles(
  fileUris: LofsRef[],
  store: ContentStore
): void {
  for (const fileUri of fileUris) {
    const parsedFile = store.parsedFiles[fileUri];
    if (parsedFile?.blockIds) {
      for (const blockId of parsedFile.blockIds) {
        delete store.blockIndex[blockId];
      }
    }
    delete store.parsedFiles[fileUri];
  }
}

// =============================================================================
// Step 4: Parsing
// =============================================================================

/**
 * Parses all files and updates the content store.
 * Returns any errors encountered during parsing.
 */
async function parseAndIndexFiles(
  filesToParse: Record<LofsRef, XmlFileInfo>,
  store: ContentStore,
  provider: StorageProvider
): Promise<OLXLoadingError[]> {
  const errors: OLXLoadingError[] = [];

  for (const [fileUri, fileRecord] of Object.entries(filesToParse) as [LofsRef, XmlFileInfo][]) {
    // Non-OLX files (auxiliary files) are stored but not parsed for blocks
    if (fileRecord.type !== fileTypes.olx && fileRecord.type !== fileTypes.xml) {
      store.parsedFiles[fileUri] = {
        ...fileRecord,
        blockIds: []
      };
      continue;
    }

    try {
      const parseResult = await parseOLX(fileRecord.content, [fileRecord.id], provider);

      collectParseErrors(parseResult.errors, errors);
      indexParsedBlocks(parseResult.idMap, store.blockIndex, fileRecord.id, errors);

      // IMPORTANT: Spread fileRecord FIRST, then set blockIds.
      // This ensures fresh blockIds from parsing overwrite any stale
      // blockIds that might exist in fileRecord (when an unchanged file
      // was promoted to changed due to auxiliary file changes).
      store.parsedFiles[fileUri] = {
        ...fileRecord,
        blockIds: parseResult.ids  // Must come AFTER spread to win
      };

    } catch (fatalError: any) {
      console.error(`\n❌ DETAILED ERROR for ${fileUri}:`);
      console.error('Message:', fatalError.message);
      console.error('Stack trace:', fatalError.stack);

      errors.push({
        type: 'file_error',
        title: `${fileUri} could not be loaded`,
        message: `Failed to parse file: ${fatalError.message}`,
        location: { provenance: [fileRecord.id] },
        technical: fatalError,
        stack: fatalError.stack
      });

      store.parsedFiles[fileUri] = {
        ...fileRecord,
        blockIds: [],
        error: fatalError.message
      };
    }
  }

  return errors;
}

/** Adds parse errors to the error collection */
function collectParseErrors(
  parseErrors: OLXLoadingError[] | undefined,
  allErrors: OLXLoadingError[]
): void {
  if (parseErrors && parseErrors.length > 0) {
    allErrors.push(...parseErrors);
  }
}

/**
 * Adds parsed blocks to the block index, merging language variants.
 *
 * Same block ID across files is allowed if they have different languages.
 * Different languages are merged into nested structure: { id: { lang: OlxJson } }
 *
 * Duplicate error only if: same ID + same language in different files.
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
      // First time seeing this ID - store the entire language map
      blockIndex[blockId] = newVariantMap;
      continue;
    }

    // Block exists - merge language variants
    for (const [lang, newOlxJson] of entriesVariantMap(newVariantMap)) {
      if (existingBlock[lang]) {
        // Same ID + same language in different files.
        // Auto-generated hash IDs (prefix "_") from blocks with
        // requiresUniqueId: false will collide when content is identical
        // across files. The within-file parser already allowed the
        // duplicate; we should do the same here — but only for blocks
        // that don't require unique IDs (stateless blocks like Markdown,
        // Explanation). Stateful blocks (e.g. TextArea) must always
        // have unique IDs, even if their content is identical.
        const existingOlxJson = existingBlock[lang];
        const requiresUnique = blockRequiresUniqueId(BLOCK_REGISTRY[newOlxJson.tag]);
        if (!requiresUnique) {
          const sameTag = existingOlxJson.tag === newOlxJson.tag;
          const sameKids = stableStringify(existingOlxJson.kids) === stableStringify(newOlxJson.kids);
          const sameAttrs = stableStringify(existingOlxJson.attributes) === stableStringify(newOlxJson.attributes);
          if (sameTag && sameKids && sameAttrs) {
            continue;  // Identical stateless block across files — not an error
          }
        }
        errors.push(createDuplicateIdError(blockId, existingOlxJson, newOlxJson, sourceFile));
        continue;  // Skip this language variant, keep the first one
      }

      // New language for this ID - merge it in
      existingBlock[lang] = newOlxJson;
    }
  }
}

/** Creates a detailed error message for duplicate block IDs */
function createDuplicateIdError(
  blockId: DefinitionKey,
  existingBlock: OlxJson,
  duplicateBlock: OlxJson,
  sourceFile: LofsCanonical
): OLXLoadingError {
  // TODO: We'd love to print line/column for both entries, but OlxJson only
  // carries `_sourceOffset` (a byte offset into the leaf source file), and
  // converting that to line/col requires the original XML text in scope —
  // which we don't have here. See the "OPEN QUESTION" comment on
  // `_sourceOffset` in lib/types.ts. For now we print the byte offset and
  // the leaf provenance URI; that's enough to grep for.
  const existingFile = existingBlock.provenance?.at(-1) ?? 'unknown';
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
