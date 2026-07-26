// packages/shared/lib/state/content.test.ts
//
// Content ledger reducer + view semantics. These are the invariants the
// RenderOLX rewrite depends on:
//   - ATOMIC LAND: one CONTENT_PARSED event lands BOTH the ledger (root/status)
//     and the block slice (olxjson) — so "root known" always implies "blocks in
//     Redux". This is the structural cure for the async-queue race.
//   - SUPERSEDE: a stale parse result (older requestKey) is rejected.
//   - LAST-VALID: a re-parse in flight, or a mid-typing parse error, keeps the
//     previous build so the screen never blanks/flashes.
//   - NO-CLOBBER: a late block-level error can't knock good content to error.
//   - DECLARED-SOURCE GATE: inline/files sources report as local (never fetched).

import { test, expect } from 'vitest';
import { updateResponseReducer } from './store';
import {
  CONTENT_PARSING, CONTENT_PARSED, CONTENT_FAILED,
  contentKeyOf, deriveContentView, isLocalBlockSource,
  sourceSignature, shouldRequestParse,
} from './content';
import { OLXJSON_ERROR, LOAD_OLXJSON } from './olxjson';
import type { ContentLedgerEntry } from '../types';

const KEY = contentKeyOf('content', 'demo', 'demo/root');
const blocks = { 'demo/root': { 'en-Latn-US': { id: 'demo/root', tag: 'Html' } } };

const base = () => ({ content: {}, olxjson: {} }) as any;
const ev = (state: any, event: string, payload: any) =>
  updateResponseReducer(state, { event, ...payload });

// ── Atomic land ─────────────────────────────────────────────────────────────

test('CONTENT_PARSED lands the ledger AND the block slice from one event', () => {
  const next = ev(base(), CONTENT_PARSED, {
    key: KEY, requestKey: 1, sourceKind: 'inline', blockSource: 'content',
    root: 'demo/root', warnings: [], blocks, retrievedAt: 111,
  });
  // Ledger: root + ready.
  expect(next.content[KEY].status).toBe('ready');
  expect(next.content[KEY].data.root).toBe('demo/root');
  // Block slice: the same event dropped the parsed block, ready.
  expect(next.olxjson.content['demo/root'].loadingState.status).toBe('ready');
});

// ── Supersede ─────────────────────────────────────────────────────────────

test('a stale PARSED (older requestKey) is rejected', () => {
  let s = ev(base(), CONTENT_PARSING, { key: KEY, requestKey: 2, sourceKind: 'inline', blockSource: 'content' });
  // Late result from an earlier attempt (rk 1) arrives after rk 2 started.
  s = ev(s, CONTENT_PARSED, {
    key: KEY, requestKey: 1, sourceKind: 'inline', blockSource: 'content',
    root: 'demo/root', warnings: [], blocks, retrievedAt: 1,
  });
  expect(s.content[KEY].status).toBe('parsing');   // still waiting for rk 2
  expect(s.content[KEY].requestKey).toBe(2);
});

// ── Last-valid (live editing) ────────────────────────────────────────────────

test('a re-parse in flight keeps the last-valid data', () => {
  let s = ev(base(), CONTENT_PARSED, {
    key: KEY, requestKey: 1, sourceKind: 'inline', blockSource: 'content',
    root: 'demo/root', warnings: [], blocks, retrievedAt: 1,
  });
  s = ev(s, CONTENT_PARSING, { key: KEY, requestKey: 2, sourceKind: 'inline', blockSource: 'content' });
  expect(s.content[KEY].status).toBe('parsing');
  expect(s.content[KEY].data.root).toBe('demo/root');           // data retained
  const view = deriveContentView(s.content[KEY], null);
  expect(view.ready).toBe(true);                                 // still renders
  expect(view.updating).toBe(true);
  expect(view.root).toBe('demo/root');
});

test('a mid-typing parse error keeps the last-valid data and surfaces gently', () => {
  let s = ev(base(), CONTENT_PARSED, {
    key: KEY, requestKey: 1, sourceKind: 'inline', blockSource: 'content',
    root: 'demo/root', warnings: [], blocks, retrievedAt: 1,
  });
  s = ev(s, CONTENT_FAILED, { key: KEY, requestKey: 2, error: { message: 'bad XML' } });
  const view = deriveContentView(s.content[KEY], null);
  expect(view.ready).toBe(true);          // still shows last valid
  expect(view.fatal).toBe(false);
  expect(view.error).toBe('bad XML');     // gentle marker
  expect(view.root).toBe('demo/root');
});

test('a first-load failure with no prior build is fatal', () => {
  const s = ev(base(), CONTENT_FAILED, { key: KEY, requestKey: 1, error: { message: 'bad XML' } });
  const view = deriveContentView(s.content[KEY], null);
  expect(view.ready).toBe(false);
  expect(view.fatal).toBe(true);
});

// ── deriveContentView fallbacks ──────────────────────────────────────────────

test('preloaded content renders its fallback root with no ledger entry', () => {
  const view = deriveContentView(undefined, 'demo/root');
  expect(view.ready).toBe(true);
  expect(view.root).toBe('demo/root');
});

test('no entry and no fallback is a loading state, never an error', () => {
  const view = deriveContentView(undefined, null);
  expect(view.ready).toBe(false);
  expect(view.updating).toBe(true);
  expect(view.fatal).toBe(false);
});

// ── No-clobber (olxjson) ─────────────────────────────────────────────────────

test('a late block-level error cannot clobber ready content', () => {
  let s = ev(base(), LOAD_OLXJSON, { source: 'content', blocks });
  expect(s.olxjson.content['demo/root'].loadingState.status).toBe('ready');
  s = ev(s, OLXJSON_ERROR, { source: 'content', id: 'demo/root', error: { message: 'late 404' } });
  expect(s.olxjson.content['demo/root'].loadingState.status).toBe('ready'); // unchanged
});

// ── Idempotent request (the catalog "stuck on parsing" fix) ──────────────────

test('sourceSignature is stable for identical content, distinct for different', () => {
  const a = sourceSignature({ sourceKind: 'inline', ns: 'demo', id: 'x', inline: '<Catalog/>' });
  const b = sourceSignature({ sourceKind: 'inline', ns: 'demo', id: 'x', inline: '<Catalog/>' });
  const c = sourceSignature({ sourceKind: 'inline', ns: 'demo', id: 'x', inline: '<Other/>' });
  expect(a).toBe(b);      // same content → same signature (no re-parse on re-render)
  expect(a).not.toBe(c);  // changed content → new signature (re-parse)
});

test('sourceSignature is order-insensitive for files', () => {
  const a = sourceSignature({ sourceKind: 'files', ns: 'demo', id: 'x', files: { 'a.olx': '1', 'b.olx': '2' } });
  const b = sourceSignature({ sourceKind: 'files', ns: 'demo', id: 'x', files: { 'b.olx': '2', 'a.olx': '1' } });
  expect(a).toBe(b);
});

test('shouldRequestParse: skip only when already ready for the SAME signature', () => {
  const sig = 'sig-1';
  const ready = { status: 'ready', requestKey: 1, sourceKind: 'inline', blockSource: 'content', signature: sig } as ContentLedgerEntry;
  // Already parsed this exact content → do not re-parse (breaks the loop).
  expect(shouldRequestParse(ready, sig)).toBe(false);
  // Content changed → re-parse.
  expect(shouldRequestParse(ready, 'sig-2')).toBe(true);
  // Absent, in-flight, or errored entries always parse (a lost parse is not
  // mistaken for a completed one).
  expect(shouldRequestParse(undefined, sig)).toBe(true);
  expect(shouldRequestParse({ ...ready, status: 'parsing' }, sig)).toBe(true);
  expect(shouldRequestParse({ ...ready, status: 'error' }, sig)).toBe(true);
});

// ── Declared-source gate ─────────────────────────────────────────────────────

test('the fetch gate: inline/files are local, preloaded is fetchable', () => {
  const mk = (sourceKind: ContentLedgerEntry['sourceKind']) => ({
    application_state: { content: { [KEY]: { status: 'ready', requestKey: 1, sourceKind, blockSource: 'content' } } },
  }) as any;
  expect(isLocalBlockSource(mk('inline'), 'content')).toBe(true);
  expect(isLocalBlockSource(mk('files'), 'content')).toBe(true);
  expect(isLocalBlockSource(mk('preloaded'), 'content')).toBe(false);
  expect(isLocalBlockSource(mk('inline'), 'other')).toBe(false); // different block-source
});

test('the gate is scoped to a namespace, so one inline render does not mute others', () => {
  // KEY is [content, demo, demo/root]. An inline render in `demo` must not stop
  // a DIFFERENT namespace from fetching real content through the same source.
  const state = {
    application_state: { content: { [KEY]: {
      status: 'ready', requestKey: 1, sourceKind: 'inline', blockSource: 'content',
    } } },
  } as any;
  expect(isLocalBlockSource(state, 'content', 'demo')).toBe(true);
  expect(isLocalBlockSource(state, 'content', 'other-ns')).toBe(false);
});

// ── Render revision (the ErrorBoundary reset seam) ───────────────────────────

test('view.revision names the LANDED build, not the in-flight attempt', () => {
  const sigA = sourceSignature({ sourceKind: 'inline', ns: 'demo', id: 'x', inline: '<A/>' });
  const sigB = sourceSignature({ sourceKind: 'inline', ns: 'demo', id: 'x', inline: '<B/>' });

  let s = ev(base(), CONTENT_PARSED, {
    key: KEY, requestKey: 1, sourceKind: 'inline', blockSource: 'content',
    signature: sigA, root: 'demo/root', warnings: [], blocks, retrievedAt: 1,
  });
  expect(deriveContentView(s.content[KEY], null).revision).toBe(sigA);

  // A newer parse starts. The entry's signature advances to the ATTEMPT, but
  // what's on screen is still build A — so the revision must not move yet, or
  // the boundary would reset against content that hasn't rendered.
  s = ev(s, CONTENT_PARSING, {
    key: KEY, requestKey: 2, sourceKind: 'inline', blockSource: 'content', signature: sigB,
  });
  expect(s.content[KEY].signature).toBe(sigB);
  expect(deriveContentView(s.content[KEY], null).revision).toBe(sigA);
});

test('editing content changes the revision even when the root id does not', () => {
  // The stuck-ErrorBoundary bug: a block that throws is fixed by editing its
  // CONTENTS, which leaves the root id identical. Keyed on root, the boundary
  // stays latched on the old failure forever; keyed on revision it resets.
  const sigA = sourceSignature({ sourceKind: 'inline', ns: 'demo', id: 'x', inline: '<Broken/>' });
  const sigB = sourceSignature({ sourceKind: 'inline', ns: 'demo', id: 'x', inline: '<Fixed/>' });
  const parsed = (rk: number, sig: string) => ({
    key: KEY, requestKey: rk, sourceKind: 'inline', blockSource: 'content',
    signature: sig, root: 'demo/root', warnings: [], blocks, retrievedAt: rk,
  });

  let s = ev(base(), CONTENT_PARSED, parsed(1, sigA));
  const before = deriveContentView(s.content[KEY], null);
  s = ev(s, CONTENT_PARSED, parsed(2, sigB));
  const after = deriveContentView(s.content[KEY], null);

  expect(after.root).toBe(before.root);           // same root — no reset signal
  expect(after.revision).not.toBe(before.revision); // but a new build — resets
});
