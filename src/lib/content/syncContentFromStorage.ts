// src/lib/content/syncContentFromStorage.ts
import { StorageProvider, FileStorageProvider, fileTypes } from '@/lib/storage';
import type { ProvenanceURI, OLXLoadingError } from '@/lib/types';
import { parseOLX } from '@/lib/content/parseOLX';

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

  const errors = [];

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
          errors.push({
            type: 'duplicate_id',
            file: uri,
            message: `Duplicate ID "${storeId}" found in ${uri}`,
            technical: { duplicateId: storeId, existingEntry: contentStore.byId[storeId] }
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
      errors.push({
        type: 'file_error',
        file: uri,
        message: `Failed to parse file: ${fatalError.message}`,
        technical: fatalError
      });

      // Store minimal entry so we don't lose track of the file
      contentStore.byProvenance[uri] = {
        nodes: [],
        ...fileInfo,
        error: fatalError.message
      };
    }
  }

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
