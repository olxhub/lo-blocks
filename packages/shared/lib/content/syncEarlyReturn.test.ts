// @vitest-environment node
// The tokened sync fast path: a second union sync with no source change must
// NOT re-scan (no loadXmlFilesWithStats call); a source whose token moved is
// rescanned and its new content indexed.

import { test, expect, vi } from 'vitest';
import { InMemoryStorageProvider } from '@/lib/lofs/providers/memory';
import { syncContentUnion } from '@/lib/content/syncContentFromStorage';

test('second union sync with unchanged tokens skips the scan', async () => {
  const provider = new InMemoryStorageProvider({ 'lesson.olx': '<Vertical/>' });
  const scanSpy = vi.spyOn(provider, 'loadXmlFilesWithStats');

  await syncContentUnion([provider]);
  expect(scanSpy).toHaveBeenCalledTimes(1); // first sync scans

  scanSpy.mockClear();
  await syncContentUnion([provider]);
  expect(scanSpy).not.toHaveBeenCalled(); // token unchanged → no rescan
});

test('a moved token triggers a rescan of that source', async () => {
  const provider = new InMemoryStorageProvider({ 'lesson.olx': '<Vertical/>' });
  await syncContentUnion([provider]);

  provider.setContent('added.olx', '<Vertical/>'); // bumps the write counter
  const scanSpy = vi.spyOn(provider, 'loadXmlFilesWithStats');
  await syncContentUnion([provider]);
  expect(scanSpy).toHaveBeenCalledTimes(1); // token moved → rescan
});
