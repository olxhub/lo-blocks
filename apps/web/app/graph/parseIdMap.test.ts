// @vitest-environment node
// apps/web/app/graph/parseIdMap.test.ts
import { parseIdMap } from '@/lib/graph/parseIdMap';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { FileStorageProvider } from '@/lib/lofs/providers/file';

describe('parseIdMap', () => {
  it('builds a graph from demo content without issues', async () => {
    const { idMap } = await syncContentFromStorage(new FileStorageProvider('content/demos'));
    const { edges, issues } = parseIdMap(idMap);
    expect(edges.length).toBeGreaterThan(0);
    expect(issues).toEqual([]);
  });
});
