// src/lib/content/syncContentFromStorage.ts
import { StorageProvider, FileStorageProvider } from '@/lib/storage';
import { parseOLX } from '@/lib/content/parseOLX';

const contentStore = {
  byProvenance: {},
  byId: {}
};

export async function syncContentFromStorage(
  provider: StorageProvider = new FileStorageProvider('./content')
) {
  const { added, changed, unchanged, deleted } = await provider.loadXmlFilesWithStats(
    contentStore.byProvenance
  );

  deleteNodesByProvenance([...Object.keys(deleted), ...Object.keys(changed)]);

  for (const [srcId, fileInfo] of Object.entries({ ...added, ...changed })) {
    const { ids, idMap } = await parseOLX(fileInfo.content, [srcId], provider);

    for (const [storeId, entry] of Object.entries(idMap)) {
      if (contentStore.byId[storeId]) {
        throw new Error(`Duplicate ID "${storeId}" found in ${srcId}`);
      }
      contentStore.byId[storeId] = entry;
    }

    contentStore.byProvenance[srcId] = {
      nodes: ids,
      ...fileInfo
    };
  }

  return {
    parsed: contentStore.byProvenance,
    idMap: contentStore.byId
  };
}

function deleteNodesByProvenance(relativePaths) {
  for (const relPath of relativePaths) {
    const prev = contentStore.byProvenance[relPath];
    if (prev?.nodes) {
      for (const id of prev.nodes) {
        delete contentStore.byId[id];
      }
    }
    delete contentStore.byProvenance[relPath];
  }
}
