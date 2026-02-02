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
import type { ProvenanceURI, OLXLoadingError } from '@/lib/types';
import { parseOLX } from '@/lib/content/parseOLX';
import { copyImagesToPublic } from '@/lib/content/imageSync';

// =============================================================================
// Types
// =============================================================================

/**
 * Metadata and content for a file from storage.
 * Matches XmlFileInfo from storage/types.ts
 */
interface FileRecord {
  id: ProvenanceURI;   // The file:// URI identifying this file
  type: string;        // File type (olx, xml, chatpeg, etc.)
  content: string;     // The file's text content
  _metadata: any;      // Provider-specific metadata (stat, hash, etc.)
}

/**
 * A parsed file's entry in the parsedFiles index.
 * Extends FileRecord with parsing results.
 */
interface ParsedFileEntry extends FileRecord {
  blockIds: string[];  // IDs of blocks parsed from this file
  error?: string;      // Set if parsing failed
}

/** The in-memory content store */
interface ContentStore {
  /** Maps file URI -> parsed file entry (what blocks came from this file) */
  parsedFiles: Record<ProvenanceURI, ParsedFileEntry>;
  /** Maps block ID -> block data (the actual parsed content) */
  blockIndex: Record<string, any>;
}

/** Result of categorizing files by change status */
interface FileChangeSets {
  added: Record<ProvenanceURI, FileRecord>;
  changed: Record<ProvenanceURI, FileRecord>;
  unchanged: Record<ProvenanceURI, ParsedFileEntry>;
  deleted: Record<ProvenanceURI, ParsedFileEntry>;
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
    contentStore.parsedFiles as Record<ProvenanceURI, any>
  ) as FileChangeSets;

  // Step 2: Find OLX files that need re-parsing due to auxiliary file changes
  await promoteFilesWithChangedDependencies(changeSets, contentStore.blockIndex, provider);

  // Step 3: Remove blocks from files that are deleted or about to be re-parsed
  const filesToRemove = [
    ...Object.keys(changeSets.deleted),
    ...Object.keys(changeSets.changed)
  ] as ProvenanceURI[];
  removeBlocksFromFiles(filesToRemove, contentStore);

  // Step 4: Parse all new and changed files
  const filesToParse = { ...changeSets.added, ...changeSets.changed };
  const errors = await parseAndIndexFiles(filesToParse, contentStore, provider);

  // Step 5: Sync images
  await copyImagesToPublic(provider);

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
async function promoteFilesWithChangedDependencies(
  changeSets: FileChangeSets,
  blockIndex: Record<string, any>,
  provider: StorageProvider
): Promise<void> {
  const changedAuxiliaryFiles = findChangedAuxiliaryFiles(changeSets);
  if (changedAuxiliaryFiles.size === 0) return;

  const olxFilesToReparse = findOlxFilesDependingOn(changedAuxiliaryFiles, blockIndex, changeSets.unchanged);

  for (const olxUri of olxFilesToReparse) {
    await moveUnchangedToChanged(olxUri, changeSets, provider);
  }
}

/** Returns URIs of non-OLX/XML files that were added, changed, or deleted */
function findChangedAuxiliaryFiles(changeSets: FileChangeSets): Set<ProvenanceURI> {
  const auxiliaryFiles = new Set<ProvenanceURI>();

  const allChangedFiles = [
    ...Object.entries(changeSets.added),
    ...Object.entries(changeSets.changed),
    ...Object.entries(changeSets.deleted)
  ];

  for (const [uri, fileRecord] of allChangedFiles) {
    const isOlxOrXml = fileRecord?.type === fileTypes.olx || fileRecord?.type === fileTypes.xml;
    if (!isOlxOrXml) {
      auxiliaryFiles.add(uri as ProvenanceURI);
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
  changedAuxiliaryFiles: Set<ProvenanceURI>,
  blockIndex: Record<string, any>,
  unchangedFiles: Record<ProvenanceURI, ParsedFileEntry>
): Set<ProvenanceURI> {
  const olxFilesToReparse = new Set<ProvenanceURI>();

  for (const block of Object.values(blockIndex)) {
    if (!block.provenance || !Array.isArray(block.provenance)) continue;

    // Check if this block's provenance includes a changed auxiliary file
    const dependsOnChangedFile = block.provenance.some(
      (prov: string) => changedAuxiliaryFiles.has(prov as ProvenanceURI)
    );

    if (dependsOnChangedFile) {
      // The root OLX file is the first element in the provenance chain
      const rootOlxFile = block.provenance[0] as ProvenanceURI;
      if (rootOlxFile && unchangedFiles[rootOlxFile]) {
        olxFilesToReparse.add(rootOlxFile);
      }
    }
  }

  return olxFilesToReparse;
}

/**
 * Moves a file from unchanged to changed, re-reading its content.
 *
 * IMPORTANT: We copy only the metadata, not the old blockIds.
 * The old entry may have blockIds from a previous parse, but we don't
 * want those carried into the changed set - fresh blockIds will be
 * set after re-parsing.
 */
async function moveUnchangedToChanged(
  fileUri: ProvenanceURI,
  changeSets: FileChangeSets,
  provider: StorageProvider
): Promise<void> {
  const existingEntry = changeSets.unchanged[fileUri];
  if (!existingEntry) return;

  // Re-read the file content (unchanged files don't have content loaded)
  const filePath = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;

  try {
    const { content } = await provider.read(filePath);

    // Create a clean FileRecord without the old blockIds
    const fileRecord: FileRecord = {
      id: existingEntry.id,
      type: existingEntry.type,
      content,
      _metadata: existingEntry._metadata
    };

    changeSets.changed[fileUri] = fileRecord;
    delete changeSets.unchanged[fileUri];
  } catch (err) {
    console.warn(`Could not re-read ${fileUri} for dependency update:`, err);
    // Leave unchanged if we can't read it
  }
}

// =============================================================================
// Step 3: Block Removal
// =============================================================================

/**
 * Removes all blocks that were parsed from the given files.
 * This cleans up the blockIndex before re-parsing.
 */
function removeBlocksFromFiles(
  fileUris: ProvenanceURI[],
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
  filesToParse: Record<ProvenanceURI, FileRecord>,
  store: ContentStore,
  provider: StorageProvider
): Promise<OLXLoadingError[]> {
  const errors: OLXLoadingError[] = [];

  for (const [fileUri, fileRecord] of Object.entries(filesToParse) as [ProvenanceURI, FileRecord][]) {
    // Non-OLX files (auxiliary files) are stored but not parsed for blocks
    if (fileRecord.type !== fileTypes.olx && fileRecord.type !== fileTypes.xml) {
      store.parsedFiles[fileUri] = {
        ...fileRecord,
        blockIds: []
      };
      continue;
    }

    try {
      const parseResult = await parseOLX(fileRecord.content, [fileUri], provider);

      collectParseErrors(parseResult.errors, errors);
      indexParsedBlocks(parseResult.idMap, store.blockIndex, fileUri, errors);

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
        file: fileUri,
        message: `Failed to parse file: ${fatalError.message}`,
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
 * Adds parsed blocks to the block index, checking for duplicates.
 * Duplicate blocks are skipped and an error is recorded.
 */
function indexParsedBlocks(
  newBlocks: Record<string, any>,
  blockIndex: Record<string, any>,
  sourceFile: ProvenanceURI,
  errors: OLXLoadingError[]
): void {
  for (const [blockId, langMap] of Object.entries(newBlocks)) {
    // newBlocks is { id: { lang: OlxJson } }
    // Store the entire nested structure with all language variants
    const existingBlock = blockIndex[blockId];

    if (existingBlock) {
      // existingBlock is also nested { lang: OlxJson }, extract first available for error message
      const existingLang = Object.values(existingBlock)[0] as any;
      const newLang = Object.values(langMap)[0] as any;
      errors.push(createDuplicateIdError(blockId, existingLang, newLang, sourceFile));
      continue;  // Skip duplicate, keep the first one
    }

    blockIndex[blockId] = langMap;  // Store nested structure with all languages
  }
}

/** Creates a detailed error message for duplicate block IDs */
function createDuplicateIdError(
  blockId: string,
  existingBlock: any,
  duplicateBlock: any,
  sourceFile: ProvenanceURI
): OLXLoadingError {
  return {
    type: 'duplicate_id',
    file: sourceFile,
    message: `Duplicate ID "${blockId}" found in ${sourceFile} (conflicts with entry from another file)

🔍 EXISTING ENTRY (from different file):
   File: ${existingBlock.file || 'unknown'}
   Line: ${existingBlock.line || '?'}, Column: ${existingBlock.column || '?'}
   Tag: <${existingBlock.tag || 'unknown'}>
   Attributes: ${JSON.stringify(existingBlock.attributes || {}, null, 2)}
   Content: ${existingBlock.text || existingBlock.kids || 'N/A'}

🔍 DUPLICATE ENTRY (in current file ${sourceFile}):
   Line: ${duplicateBlock.line || '?'}, Column: ${duplicateBlock.column || '?'}
   Tag: <${duplicateBlock.tag || 'unknown'}>
   Attributes: ${JSON.stringify(duplicateBlock.attributes || {}, null, 2)}
   Content: ${duplicateBlock.text || duplicateBlock.kids || 'N/A'}

💡 TIP: IDs must be unique across ALL files in the project. Use different id attributes or prefixes for each file.`,
    technical: {
      duplicateId: blockId,
      existingEntry: existingBlock,
      duplicateEntry: duplicateBlock
    }
  };
}
