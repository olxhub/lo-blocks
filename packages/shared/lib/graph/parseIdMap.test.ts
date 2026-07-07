// @vitest-environment node
// packages/shared/lib/graph/parseIdMap.test.ts
import { parseIdMap } from '@/lib/graph/parseIdMap';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import { asContentNamespace } from '@/lib/types/id-grammar';

describe('parseIdMap', () => {
  it('builds a graph from demo content without issues', async () => {
    // This mounts a single course directory directly, so directory-derived
    // namespaces don't apply (files sit at the provider root) — declare the
    // namespace explicitly, matching what ./content derives for demos/.
    const provider = new FileStorageProvider('content/demos', undefined, { ns: asContentNamespace('demos') });
    const { idMap, errors } = await syncContentFromStorage(provider);
    expect(errors).toEqual([]);
    const { edges, issues } = parseIdMap(idMap);
    expect(edges.length).toBeGreaterThan(0);
    expect(issues).toEqual([]);
  });
});
