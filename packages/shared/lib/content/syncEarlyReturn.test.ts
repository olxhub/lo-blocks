// @vitest-environment node
// The tokened sync fast path: a second union sync with no source change must
// NOT re-enumerate (no listContent call); a source whose token moved is
// re-enumerated and its new content indexed.

import { test, expect, vi } from 'vitest';
import { InMemoryStorageProvider } from '@/lib/lofs/providers/memory';
import { syncContentUnion } from '@/lib/content/syncContentFromStorage';

test('second union sync with unchanged tokens skips the scan', async () => {
  const provider = new InMemoryStorageProvider({ 'lesson.olx': '<Vertical/>' });
  const scanSpy = vi.spyOn(provider, 'listContent');

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
  const scanSpy = vi.spyOn(provider, 'listContent');
  await syncContentUnion([provider]);
  expect(scanSpy).toHaveBeenCalledTimes(1); // token moved → rescan
});

test('a swapped source set with coincidentally equal tokens re-enumerates (review 2026-07-14)', async () => {
  // Two distinct providers whose cheap tokens coincide (same content → same
  // write-counter token). Identity, not just the token, must gate the fast path.
  const a = new InMemoryStorageProvider({ 'a.olx': '<Vertical id="from_a"/>' });
  const b = new InMemoryStorageProvider({ 'b.olx': '<Vertical id="from_b"/>' });
  // Configured providers carry an origin (contentSources sets it); the token
  // identity check keys on it. Mirror that here.
  (a as any).origin = 'memory:src-a';
  (b as any).origin = 'memory:src-b';

  await syncContentUnion([a]);
  const bSpy = vi.spyOn(b, 'listContent');
  const result = await syncContentUnion([b]);
  expect(bSpy).toHaveBeenCalled();            // config swap must not fast-path
  const ids = Object.keys(result.idMap ?? {}).join(' ');
  expect(ids).toContain('from_b');
  expect(ids).not.toContain('from_a');        // old source's content gone
});

test('a transient enumeration failure is not sticky (review 2026-07-14)', async () => {
  const healthy = new InMemoryStorageProvider({ 'ok.olx': '<Vertical/>' });
  const flaky = new InMemoryStorageProvider({ 'flaky.olx': '<Vertical/>' });
  // force a fresh union state
  healthy.setContent('ok2.olx', '<Vertical/>');

  const boom = vi.spyOn(flaky, 'listContent').mockRejectedValueOnce(new Error('remote down'));
  await syncContentUnion([healthy, flaky]);   // flaky fails once

  // Recovery: next sync must re-enumerate (tokens were NOT remembered)…
  await syncContentUnion([healthy, flaky]);
  expect(boom).toHaveBeenCalledTimes(2);      // retried, second call succeeds
});
