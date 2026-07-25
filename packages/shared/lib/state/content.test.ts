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

// ── Declared-source gate ─────────────────────────────────────────────────────

test('isLocalBlockSource is true for inline/files, false for preloaded', () => {
  const mk = (sourceKind: ContentLedgerEntry['sourceKind']) => ({
    application_state: { content: { [KEY]: { status: 'ready', requestKey: 1, sourceKind, blockSource: 'content' } } },
  }) as any;
  expect(isLocalBlockSource(mk('inline'), 'content')).toBe(true);
  expect(isLocalBlockSource(mk('files'), 'content')).toBe(true);
  expect(isLocalBlockSource(mk('preloaded'), 'content')).toBe(false);
  expect(isLocalBlockSource(mk('inline'), 'other')).toBe(false); // different block-source
});
