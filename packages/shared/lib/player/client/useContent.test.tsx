// @vitest-environment jsdom
// packages/shared/lib/player/client/useContent.test.tsx
//
// useContent's `files` parse order.
//
// sourceSignature() names a `files` source order-insensitively (it sorts the
// filenames before hashing). parseDeclaredSource must therefore BUILD in that
// same sorted order, because the build is order-SENSITIVE in two ways: the last
// file parsed wins `root`, and a later file's duplicate ids overwrite an
// earlier file's. Parse in insertion order and two inputs share one canonical
// name while producing different trees — the ledger's cached build is then for a
// different tree than the name claims.
//
// parseDeclaredSource is module-private, so the test drives the hook and reads
// what it emits: the CONTENT_PARSED payload carries `root` and `blocks`, which
// is exactly the build under test. Deleting the `.sort()` in
// parseDeclaredSource makes the two orders disagree and fails this test.

import React from 'react';
import { Provider } from 'react-redux';
import { renderHook, waitFor } from '@testing-library/react';

import { useContent } from './useContent';
import { store } from '@/lib/state/store';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { CONTENT_PARSED, sourceSignature } from '@/lib/state/content';
import { TEST_NS, mockRuntime } from '@/lib/test-utils';
import { InMemoryStorageProvider } from '@/lib/storage/lofs';
import type { StateKey } from '@/lib/types';

// Two files with DIFFERENT roots and a SHARED block id: both order-sensitive
// aspects of the build in one fixture. In sorted order 'a.olx' parses first,
// so 'b.olx' must win both — the root and the duplicate id.
// (Ids are leaf DefinitionRefs — no dashes; parseOLX rejects those.)
const A = '<Vertical id="rootA"><HtmlBlock id="dup" content="fromA"/></Vertical>';
const B = '<Vertical id="rootB"><HtmlBlock id="dup" content="fromB"/></Vertical>';

/** Render useContent over a `files` map and return the CONTENT_PARSED payload.
 *  A bare object is provider enough: these fixtures have no src="" refs to
 *  resolve, and parseDeclaredSource only requires a provider to be present. */
async function buildFrom(files: Record<string, string>, provider: any = {}) {
  const parsed: any[] = [];
  const runtime = mockRuntime({
    sideEffectFree: false,   // sideEffectFree skips parsing entirely
    logEvent: (name: string, payload: any) => {
      if (name === CONTENT_PARSED) parsed.push(payload);
    },
  }) as any;

  const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });
  const wrapper = ({ children }: any) => <Provider store={reduxStore}>{children}</Provider>;
  renderHook(() => useContent({
    ns: TEST_NS, id: 'rootA' as StateKey, files, provider,
    blockSource: 'content', runtime, debounceMs: 0,
  }), { wrapper });

  await waitFor(() => expect(parsed).toHaveLength(1));
  return parsed[0];
}

test('files build in sorted order, so insertion order cannot change the build', async () => {
  const forward = await buildFrom({ 'a.olx': A, 'b.olx': B });
  const reverse = await buildFrom({ 'b.olx': B, 'a.olx': A });

  // Same source, so the two runs must agree on the canonical name...
  expect(reverse.signature).toBe(forward.signature);
  // ...and, the point of the test, on the BUILD that name stands for.
  expect(reverse.root).toBe(forward.root);
  expect(reverse.blocks).toEqual(forward.blocks);

  // And it is the SORTED order that decides, not the insertion order of
  // either call: the last file in sorted order ('b.olx') owns the root and
  // wins the duplicate id.
  expect(String(forward.root)).toContain('rootB');
  const dup = Object.entries(forward.blocks as Record<string, any>)
    .find(([key]) => key.endsWith('dup'))![1];
  expect(JSON.stringify(dup)).toContain('fromB');
  expect(JSON.stringify(dup)).not.toContain('fromA');
});

test('sourceSignature is order-insensitive (the property the sort must match)', () => {
  // The other half of the invariant, asserted directly: if this ever becomes
  // order-SENSITIVE, sorting the parse is no longer what keeps name and build
  // in agreement, and the test above stops meaning what it says.
  const args = { sourceKind: 'files' as const, ns: TEST_NS, id: 'rootA' };
  expect(sourceSignature({ ...args, files: { 'b.olx': B, 'a.olx': A } }))
    .toBe(sourceSignature({ ...args, files: { 'a.olx': A, 'b.olx': B } }));
});

// ── Recorded external deps, and the mount re-parse they gate ─────────────────
//
// sourceSignature() names the DECLARED source only, so content the parse pulled
// in through the provider stack (src= companion files) is invisible to the
// idempotency guard. The build therefore records what it read
// (ContentLedgerData.deps), and a fresh MOUNT of a dep-bearing build re-parses
// — main's close-and-reopen-the-preview recovery, confined to the builds that
// actually have companion files.

test('an internal src= between declared files is NOT an external dep', async () => {
  // Both files are in the `files` map, so the signature already covers them:
  // editing either one changes the name and re-parses anyway. Counting the src=
  // read as external would make ordinary multi-file content pay a mount
  // re-parse forever. (Deleting the source-subtraction in parseDeclaredSource
  // fails this test.)
  const files = {
    'a.olx': '<Vertical id="rootA"><Markdown id="inner" src="b.olx"/></Vertical>',
    'b.olx': '<Vertical id="rootB"/>',
  };
  const payload = await buildFrom(files, new InMemoryStorageProvider(files));
  expect(payload.deps).toEqual([]);
});

test('a file only the provider has IS recorded as an external dep', async () => {
  // 'note.md' is not declared, so nothing about it feeds the signature — the
  // recorded dep is the only trace that this build depends on its bytes.
  const files = { 'a.olx': '<Vertical id="rootA"><Markdown id="inner" src="note.md"/></Vertical>' };
  const provider = new InMemoryStorageProvider({ ...files, 'note.md': 'hello' });
  const payload = await buildFrom(files, provider);
  expect(payload.deps).toHaveLength(1);
  expect(String(payload.deps[0])).toContain('note.md');
});

/** Mount useContent against a SHARED store, folding what it emits back into
 *  that store — so a second mount is a fresh hook instance meeting an existing
 *  ledger entry, i.e. the remount case. Returns the events this mount emitted.
 *  `debounceMs` is a rerender-able prop purely so a test can force the request
 *  effect to fire a SECOND time within one instance. */
function mountOver(reduxStore: any, id: string, files: Record<string, string>, provider: any) {
  const events: string[] = [];
  const runtime = mockRuntime({
    sideEffectFree: false,
    logEvent: (name: string, payload: any) => {
      events.push(name);
      reduxStore.dispatch({
        redux_type: 'EMIT_EVENT', type: name,
        payload: JSON.stringify({ event: name, ...payload }),
      });
    },
  }) as any;
  const wrapper = ({ children }: any) => <Provider store={reduxStore}>{children}</Provider>;
  const view = renderHook(({ debounceMs }: { debounceMs: number }) => useContent({
    ns: TEST_NS, id: id as StateKey, files, provider,
    blockSource: 'content', runtime, debounceMs,
  }), { wrapper, initialProps: { debounceMs: 0 } });
  return { events, view };
}

test('a remount re-parses a dep-bearing build, at most once', async () => {
  const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });
  const files = { 'a.olx': '<Vertical id="rootA"><Markdown id="inner" src="note.md"/></Vertical>' };
  const provider = new InMemoryStorageProvider({ ...files, 'note.md': 'hello' });

  const first = mountOver(reduxStore, 'rootA', files, provider);
  await waitFor(() => expect(first.events).toContain(CONTENT_PARSED));
  first.view.unmount();

  // Same signature, ready entry — the plain idempotency guard would skip. The
  // recorded dep is what earns the re-parse. (Deleting the dep bypass in
  // useContent fails this test.)
  const second = mountOver(reduxStore, 'rootA', files, provider);
  await waitFor(() => expect(second.events).toContain(CONTENT_PARSED));

  // ...and ONCE per instance. The re-parse's own PARSED lands a ready entry
  // that STILL carries deps, so an ungated bypass would take itself again on
  // every later effect fire — a parse loop. Force a second fire (changing
  // debounceMs re-fires the effect) and check nothing new goes out.
  second.view.rerender({ debounceMs: 1 });
  await new Promise(r => setTimeout(r, 50));
  expect(second.events.filter(e => e === CONTENT_PARSED)).toHaveLength(1);
  second.view.unmount();
});

test('a remount does NOT re-parse a build with no external deps', async () => {
  // Nothing the signature cannot see → the cached build is authoritative and a
  // remount stays silent (no re-parse, no CONTENT_PARSED back into the stream).
  const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });
  const files = { 'c.olx': '<Vertical id="rootC"><Markdown id="plain">hi</Markdown></Vertical>' };
  const provider = new InMemoryStorageProvider(files);

  const first = mountOver(reduxStore, 'rootC', files, provider);
  await waitFor(() => expect(first.events).toContain(CONTENT_PARSED));
  first.view.unmount();

  const second = mountOver(reduxStore, 'rootC', files, provider);
  await new Promise(r => setTimeout(r, 20));
  expect(second.events).toEqual([]);
});
