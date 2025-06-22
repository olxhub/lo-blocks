// src/lib/content/syncContentFromStorage.ts
import { StorageProvider, FileStorageProvider, fileTypes } from '@/lib/storage';
import type { ProvenanceURI } from '@/lib/types';
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

  for (const [uri, fileInfo] of Object.entries({ ...added, ...changed }) as [ProvenanceURI, any][]) {
    if (fileInfo.type !== fileTypes.olx && fileInfo.type !== fileTypes.xml) {
      contentStore.byProvenance[uri] = {
        nodes: [],
        ...fileInfo,
      };
      continue;
    }

    const { ids, idMap } = await parseOLX(fileInfo.content, [uri], provider);

    for (const [storeId, entry] of Object.entries(idMap)) {
      if (contentStore.byId[storeId]) {
        throw new Error(`Duplicate ID "${storeId}" found in ${uri}`);
      }
      contentStore.byId[storeId] = entry;
    }

    contentStore.byProvenance[uri] = {
      nodes: ids,
      ...fileInfo
    };
  }

  return {
    parsed: contentStore.byProvenance,
    idMap: contentStore.byId
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
