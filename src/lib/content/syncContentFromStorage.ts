// src/lib/content/syncContentFromStorage.ts
//
// Content synchronization - main orchestrator for loading OLX content into memory.
//
// Manages the complete pipeline from file system to in-memory representation:
// - Scans storage provider for OLX/XML files with change detection
// - Parses files through the OLX parser with error collection
// - Maintains global idMap for block lookups across all content
// - Handles duplicate ID detection and conflict resolution
// - Triggers image synchronization for Next.js serving
//
// This is the primary entry point for loading Learning Observer content,
// providing both initial loading and incremental updates as files change.
// The system maintains provenance tracking so errors can be traced back
// to specific files and locations.
//
import { StorageProvider, FileStorageProvider, fileTypes } from '@/lib/storage';
import type { ProvenanceURI, OLXLoadingError } from '@/lib/types';
import { parseOLX } from '@/lib/content/parseOLX';
import { copyImagesToPublic } from '@/lib/content/imageSync';

const contentStore = {
  byProvenance: {},
  byId: {}
};

export async function syncContentFromStorage(
  provider: StorageProvider = new FileStorageProvider('./content')
) {
  const { added, changed, unchanged, deleted } = await provider.loadXmlFilesWithStats(
    contentStore.byProvenance as Record<ProvenanceURI, any>
  );

  deleteNodesByProvenance([
    ...Object.keys(deleted),
    ...Object.keys(changed)
  ] as ProvenanceURI[]);

  const errors: OLXLoadingError[] = [];

  for (const [uri, fileInfo] of Object.entries({ ...added, ...changed }) as [ProvenanceURI, any][]) {
    if (fileInfo.type !== fileTypes.olx && fileInfo.type !== fileTypes.xml) {
      contentStore.byProvenance[uri] = {
        nodes: [],
        ...fileInfo,
      };
      continue;
    }

    try {
      const { ids, idMap, errors: fileErrors } = await parseOLX(fileInfo.content, [uri], provider);

      // Collect any errors from this file
      if (fileErrors && fileErrors.length > 0) {
        errors.push(...fileErrors);
      }

      // Check for duplicate IDs and collect those errors too
      for (const [storeId, entry] of Object.entries(idMap)) {
        if (contentStore.byId[storeId]) {
          const existingEntry = contentStore.byId[storeId];
          const existingXml = existingEntry.rawParsed ? JSON.stringify(existingEntry.rawParsed, null, 2) : 'N/A';
          const duplicateXml = entry.rawParsed ? JSON.stringify(entry.rawParsed, null, 2) : 'N/A';

          errors.push({
            type: 'duplicate_id',
            file: uri,
            message: `Duplicate ID "${storeId}" found in ${uri} (conflicts with entry from another file)

🔍 EXISTING ENTRY (from different file):
   File: ${existingEntry.file || 'unknown'}
   Line: ${existingEntry.line || '?'}, Column: ${existingEntry.column || '?'}
   Tag: <${existingEntry.tag || 'unknown'}>
   Attributes: ${JSON.stringify(existingEntry.attributes || {}, null, 2)}
   Content: ${existingEntry.text || existingEntry.kids || 'N/A'}
   Full XML: ${existingXml.slice(0, 500)}${existingXml.length > 500 ? '...' : ''}

🔍 DUPLICATE ENTRY (in current file ${uri}):
   Line: ${entry.line || '?'}, Column: ${entry.column || '?'}
   Tag: <${entry.tag || 'unknown'}>
   Attributes: ${JSON.stringify(entry.attributes || {}, null, 2)}
   Content: ${entry.text || entry.kids || 'N/A'}
   Full XML: ${duplicateXml.slice(0, 500)}${duplicateXml.length > 500 ? '...' : ''}

💡 TIP: IDs must be unique across ALL files in the project. Use different id attributes or prefixes for each file.`,
            technical: {
              duplicateId: storeId,
              existingEntry: existingEntry,
              duplicateEntry: entry,
              existingXml: existingXml,
              duplicateXml: duplicateXml
            }
          });
          // Skip adding the duplicate, keep the first one
          continue;
        }
        contentStore.byId[storeId] = entry;
      }

      contentStore.byProvenance[uri] = {
        nodes: ids,
        ...fileInfo
      };

    } catch (fatalError) {
      // If parseOLX itself fails catastrophically, log it but continue
      console.error(`\n❌ DETAILED ERROR for ${uri}:`);
      console.error('Message:', fatalError.message);
      console.error('Stack trace:', fatalError.stack);

      errors.push({
        type: 'file_error',
        file: uri,
        message: `Failed to parse file: ${fatalError.message}`,
        technical: fatalError,
        stack: fatalError.stack
      });

      // Store minimal entry so we don't lose track of the file
      contentStore.byProvenance[uri] = {
        nodes: [],
        ...fileInfo,
        error: fatalError.message
      };
    }
  }

  // Copy images to public directory for Next.js optimization
  await copyImagesToPublic(provider);

  return {
    parsed: contentStore.byProvenance,
    idMap: contentStore.byId,
    errors
  };
}

function deleteNodesByProvenance(uris: ProvenanceURI[]) {
  for (const uri of uris) {
    const prev = contentStore.byProvenance[uri];
    if (prev?.nodes) {
      for (const id of prev.nodes) {
        delete contentStore.byId[id];
      }
    }
    delete contentStore.byProvenance[uri];
  }
}
