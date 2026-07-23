// packages/shared/integration/demoRenderHarness.ts
//
// Shared harness for the demo-render sweep: parse and mount every .olx
// example under a set of block categories, collecting errors.
//
// The sweep is SHARDED across several thin test files (demo-render.*.test.ts)
// because vitest parallelizes across files, not within them — one sequential
// sweep over every example was the suite's longest pole (~50s). Each shard
// covers a fixed set of top-level block directories; DEMO_RENDER_SHARDS is
// the single source of truth, and demo-render.test.ts asserts every
// category on disk is covered by exactly one shard, so adding a block
// category without assigning it to a shard fails the suite instead of
// silently losing coverage.
//
// Importing this module also installs the jsdom shims and the fetch mock
// (side effects) — every demo-render test file needs them.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { parseOLX } from '@/lib/content/parseOLX';
import { linkContent } from '@/lib/content/linkContent';
import { toMemoryRef } from '@/lib/types/storage';
import { FileStorageProvider } from '@/lib/lofs/providers/file';

import * as lo_event from 'lo_event';
import { render, makeRootNode } from '@/lib/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/componentLoader';
import { preloadCodeEditor } from '@/components/common/CodeEditor/CodeEditor';
import { Provider } from 'react-redux';
import React from 'react';
import { store } from '@/lib/state/store';
import { dispatchOlxJsonSync } from '@/lib/state/olxjson';
import { render as rtlRender, cleanup, act } from '@testing-library/react';
import fs from 'fs/promises';
import path from 'path';
import { injectPreviewContent } from '@/lib/template/previewTemplate';
import { getTextDirection } from '@/lib/i18n/getTextDirection';
import { mockRuntime, TEST_NS } from '@/lib/test-utils';
import { toUserLocale } from '@/lib/types/i18n';
import type { SafeRelativePath } from '@/lib/types';
import { initConfig } from '@/lib/config';

// Mock the MCP client (docs/catalog/sources all funnel through it —
// authoring blocks like DocsBrowser/BlockIndex/Catalog call useDocs/
// useFormats/ensureCatalog/ensureSources on mount). The real client opens a
// StreamableHTTPClientTransport to /mcp, which jsdom/undici's cross-realm
// AbortSignal handling can't complete — it fails (twice, since docs fetches
// opt into retry:true), asynchronously, well after the mount's `act()` has
// returned. Stubbing at this boundary (rather than mocking the /mcp fetch
// response) skips the transport entirely, so there's nothing to retry and
// nothing to warn about act().
vi.mock('@/lib/mcp/client', () => ({
  callMcpTool: async (name: string, _args: Record<string, unknown> = {}) => {
    switch (name) {
      case 'get_blocks': return { blocks: [], total: 0 };
      case 'get_formats': return { formats: [], total: 0 };
      case 'get_repositories': return { repositories: [], total: 0 };
      case 'get_sources': return { sources: [] };
      default: return {};
    }
  },
  listMcpTools: async () => [],
}));

// Rendering reads config (needsTranslation → getConfigBool), which fails
// fast when uninitialized. Empty PMSS: every getConfig resolves to null,
// so translanguaging etc. are off — same as the pre-2026-07 behavior when
// the Next.js process (which never initialized config) rendered these.
initConfig('', ['client', 'test']);

export const BLOCKS_DIR = path.resolve('./packages/shared/components/blocks');

/**
 * Shard → top-level block directories it sweeps. Grouped for rough balance
 * (2026-07-04 timings); rebalance freely — the coverage test in
 * demo-render.test.ts keeps the union honest, whatever the grouping.
 */
export const DEMO_RENDER_SHARDS: Record<string, string[]> = {
  assessment: ['CapaProblem', 'MarkupProblem', 'input', 'grading'],
  display: ['display', 'reference', 'utility', 'authoring', '_test', 'media'],
  layout: ['layout', 'navigation', 'action'],
  scenario: ['scenario', 'language-arts', 'specialized'],
};

// ─── jsdom shims (side effects on import) ────────────────────────────────────

if (typeof window !== 'undefined' && !window.matchMedia) {
  // NOTE: Temporary compatibility shim for jsdom in CI.
  // This test previously passed.
  //
  // It still passes locally, but breaks on github with:
  //    "TypeError: window.matchMedia is not a function"
  // This is probably a temporary environment issue, so will be good
  // to remove at some point.
  //
  // (added March 2026)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: () => { },
      removeListener: () => { },
      addEventListener: () => { },
      removeEventListener: () => { },
      dispatchEvent: () => false,
    }),
  });
}

// Mock scrollTo/scrollIntoView for jsdom (Chat scrolls panes; Transcript
// scrolls the active cue into view)
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function() { };
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function() { };
}

// Mock fetch for the render sweep.
// - /api/olxjson/: 404 (no server in tests; blocks not in Redux stay absent)
// - /content/* asset paths: served from the SOURCE content/ dir (the
//   gitignored apps/server/public/content copy is a build:sync-images
//   product, absent on a fresh checkout) so demos exercise their actual
//   assets. A MISSING asset both returns 404 and is recorded in
//   missingAssets — renderDemoFile fails the demo for it, because a demo
//   referencing a nonexistent file is a broken demo even when the block
//   degrades gracefully. (Previously these fell through to real fetch,
//   which throws TypeError on relative URLs in Node, and the block's
//   catch swallowed it — the sweep passed with the asset absent.)
const originalFetch = global.fetch;
const CONTENT_DIR = path.resolve('./content');
export const missingAssets: string[] = [];
global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  // fetchOlxJson.ts calls '/api/olxjson?id=...' — match the pathname (not a
  // substring) so the query string doesn't matter and other /api/olxjson*
  // routes (there are none today) wouldn't be swallowed by accident.
  const pathname = (() => {
    try { return new URL(urlStr, window.location.origin).pathname; } catch { return null; }
  })();
  if (pathname === '/api/olxjson') {
    return new Response(JSON.stringify({ ok: false, error: `Block not found (test environment)` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (urlStr.startsWith('/content/')) {
    const filePath = path.join(CONTENT_DIR, urlStr.slice('/content/'.length));
    if (filePath.startsWith(CONTENT_DIR)) {
      try {
        const content = await fs.readFile(filePath);
        return new Response(content, { status: 200 });
      } catch {
        missingAssets.push(urlStr);
        return new Response('Not found (test environment)', { status: 404 });
      }
    }
  }
  return originalFetch(url, options);
};

// ─── String-mount helper ─────────────────────────────────────────────────────

/**
 * Parse an OLX string and mount it with a fresh store — for interaction
 * tests (e.g. grading-per-field.test.tsx). Unlike the render sweep, events
 * dispatch for real by default so tests can drive inputs and assert state.
 */
export async function mountOLXString(
  olx: string,
  { sourceName = 'test-olx', logEvent = lo_event.logEvent }: {
    sourceName?: string;
    logEvent?: typeof lo_event.logEvent | null;
  } = {},
) {
  const { idMap, root } = await parseOLX(olx, [toMemoryRef(sourceName)], undefined, TEST_NS);
  const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });
  dispatchOlxJsonSync(reduxStore, 'content', idMap);
  const localeCode = toUserLocale('en-Latn-US');
  const runtime = mockRuntime({
    blockRegistry: BLOCK_REGISTRY,
    store: reduxStore,
    olxJsonSources: ['content'],
    locale: { code: localeCode, dir: getTextDirection(localeCode) },
    ...(logEvent ? { logEvent, sideEffectFree: false } : {}),
  });
  const element = render({
    node: { type: 'block', id: root! },
    nodeInfo: makeRootNode(runtime),
    runtime,
  });
  const rendered = rtlRender(
    React.createElement(Provider, { store: reduxStore, children: element })
  );
  return { reduxStore, ...rendered };
}

// ─── File discovery ──────────────────────────────────────────────────────────

/** Recursively find all .olx files in a directory. */
export async function findOlxFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return; // Skip directories we can't read
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('.olx')) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

// ─── The sweep ───────────────────────────────────────────────────────────────

/** Parse and mount one demo file; returns an error record or null.
 *  Extracted verbatim from the original single-file sweep. */
async function renderDemoFile(filePath: string): Promise<{ file: string; error: string } | null> {
  const relativePath = path.relative(process.cwd(), filePath);
  const fileName = path.basename(filePath);

  // Files that intentionally render DisplayError for testing purposes
  const intentionalErrorFiles = [
    'ErrorNode.olx', // Tests the error display component itself
  ];
  const isIntentionalError = intentionalErrorFiles.some(f => fileName === f);

  try {
    // Read the file
    let content = await fs.readFile(filePath, 'utf-8');

    // For .pegjs.preview.olx files, inject sample content from companion file
    if (filePath.endsWith('.pegjs.preview.olx')) {
      // Find companion sample file (e.g., sort.pegjs.preview.sortpeg)
      const dir = path.dirname(filePath);
      const baseName = path.basename(filePath, '.olx'); // e.g., "sort.pegjs.preview"
      const files = await fs.readdir(dir);
      const sampleFile = files.find(f => f.startsWith(baseName) && !f.endsWith('.olx'));

      if (sampleFile) {
        const sampleContent = await fs.readFile(path.join(dir, sampleFile), 'utf-8');
        const result = injectPreviewContent(content, sampleContent);
        if ('error' in result) {
          return { file: relativePath, error: result.error };
        }
        content = result.olx;
      } else {
        return {
          file: relativePath,
          error: `No sample content file found for preview (expected ${baseName}.*)`
        };
      }
    }

    // Parse the OLX with a provider rooted at the example's directory
    // so blocks with src= or data= can resolve relative file references.
    const exampleDir = path.dirname(filePath);
    const exampleProvider = new FileStorageProvider(exampleDir, 'demo');
    // Example basenames are known-safe test fixtures (same pattern as
    // stacked.test.ts) — the brand normally comes from resolveRelativePath.
    const exampleRef = exampleProvider.toLofsRef(fileName as SafeRelativePath);
    const parseResult = await parseOLX(content, [exampleRef], exampleProvider, TEST_NS);
    let { idMap } = parseResult;
    const { root } = parseResult;

    // Examples may <Use ref> shared fixtures from sibling *.includes.olx
    // files (see lib/lofs/providers/docs.ts). In production those resolve
    // through the synced docs index; here, merge same-directory includes
    // as base content (the example's own blocks take priority).
    if (!fileName.endsWith('.includes.olx')) {
      const dir = path.dirname(filePath);
      const siblings = await fs.readdir(dir);
      for (const sibling of siblings.filter(f => f.endsWith('.includes.olx'))) {
        const includePath = path.join(dir, sibling);
        const includeContent = await fs.readFile(includePath, 'utf-8');
        const includeResult = await parseOLX(includeContent, [toMemoryRef(includePath)], undefined, TEST_NS);
        idMap = { ...includeResult.idMap, ...idMap };
      }
    }

    // Link the merged snapshot (example + sibling includes) before render.
    // [pipeline] parse → merge → (ID-finalize: reserved) → linkContent → render
    idMap = linkContent(idMap).idMap;

    if (!root || !idMap[root]) {
      return { file: relativePath, error: 'No root element found after parsing' };
    }

    // Parse warnings (result.errors on an otherwise-successful parse:
    // attribute-validation ErrorNodes, type mismatches, etc.) are fatal
    // here too. Previously they were silently ignored — a demo emitting a
    // warning passed unnoticed. A fixture that legitimately needs to show a
    // warning belongs in the error-pipeline canary suite, not here.
    if (!isIntentionalError && parseResult.errors?.length) {
      const msgs = parseResult.errors
        .map(e => e.title || e.message || String(e))
        .join('; ');
      return { file: relativePath, error: `Parse warning(s): ${msgs}` };
    }

    // Create Redux store and populate with parsed content synchronously
    const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });
    dispatchOlxJsonSync(reduxStore, 'content', idMap);

    // Render the component
    const localeCode = toUserLocale('en-Latn-US');
    const runtime = mockRuntime({
      blockRegistry: BLOCK_REGISTRY,
      store: reduxStore,
      olxJsonSources: ['content'],
      locale: { code: localeCode, dir: getTextDirection(localeCode) },
    });
    const element = render({
      node: { type: 'block', id: root },
      nodeInfo: makeRootNode(runtime),
      runtime,
    });

    // Use React Testing Library to actually mount the component
    // This will catch React errors that only occur during render
    const { unmount, container } = rtlRender(
      React.createElement(Provider, { store: reduxStore, children: element })
    );

    // Check for DisplayError components in the rendered output (skip intentional error files)
    if (!isIntentionalError) {
      const displayErrors = container.querySelectorAll('.lo-display-error');
      if (displayErrors.length > 0) {
        const errorMessages = Array.from(displayErrors).map(el => {
          const strong = el.querySelector('strong')?.textContent || 'Unknown';
          const text = (el.textContent ?? '').split(':')[1]?.trim().split('\n')[0] || '';
          return `${strong}: ${text}`;
        });
        return {
          file: relativePath,
          error: `DisplayError rendered: ${errorMessages.join('; ')}`
        };
      }
    }

    // Flush microtasks/timers so async asset loads kicked off by mount
    // (e.g. Transcript's VTT fetch) settle and record their failures. Two
    // ticks under act(): the now-in-process MCP mock (see callMcpTool mock
    // above) still resolves via a real Promise.then chain that dispatches
    // Redux actions, so one tick isn't always enough to land the resulting
    // state update before the test moves on.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    if (missingAssets.length > 0) {
      const missing = [...new Set(missingAssets)];
      missingAssets.length = 0;
      return {
        file: relativePath,
        error: `Referenced asset(s) missing from apps/server/public: ${missing.join(', ')}`,
      };
    }

    // Clean up
    unmount();
    cleanup();
    return null;

  } catch (err: any) {
    // Include full stack trace for debugging
    const errorWithStack = err.stack || err.message || String(err);
    return { file: relativePath, error: errorWithStack };
  }
}

/**
 * Register one shard's sweep. Called from a thin demo-render.<shard>.test.ts
 * file (which must carry `// @vitest-environment jsdom`).
 */
export function registerDemoRenderShard(shardName: keyof typeof DEMO_RENDER_SHARDS) {
  const categories = DEMO_RENDER_SHARDS[shardName];

  // Components are lazy; these tests assert synchronously after mount, so
  // resolve every loader up front (examples embed blocks from other
  // categories, so the whole registry preloads). This also keeps the render
  // sweep meaningful — without it, lazy blocks would render as spinners and
  // "renders without errors" would silently stop exercising the components.
  beforeAll(async () => {
    await Promise.all([
      preloadBlockComponents(Object.values(BLOCK_REGISTRY)),
      // useReferences (lib/stateLanguage/hooks.ts) dynamically imports this
      // inside a useEffect to break a module cycle — warm the chunk here so
      // that import resolves synchronously-ish during mount instead of
      // still being in flight when the test asserts.
      import('@/lib/blocks/useOlxJson'),
      // CodeEditor (authoring blocks embed it) lazy-loads CodeMirror the
      // same way; same reasoning.
      preloadCodeEditor(),
    ]);
  }, 60_000);

  describe(`Demo OLX files render without errors (${shardName}: ${categories.join(', ')})`, () => {
    let demoFiles: string[] = [];

    beforeAll(async () => {
      const all = await findOlxFiles(BLOCKS_DIR);
      demoFiles = all.filter(f =>
        categories.includes(path.relative(BLOCKS_DIR, f).split(path.sep)[0])
      );
    });

    it('found demo files to test', () => {
      expect(demoFiles.length).toBeGreaterThan(0);
    });

    it('all demo files parse and render without throwing', async () => {
      const errors: { file: string; error: string }[] = [];
      for (const filePath of demoFiles) {
        // BadBlock fixtures fail on purpose (parse/render). They are asserted
        // separately in the error-pipeline canary suite (demo-render.test.ts),
        // which proves the detection channels THIS test relies on actually fire.
        if (path.basename(filePath).startsWith('BadBlock')) continue;

        const error = await renderDemoFile(filePath);
        if (error) errors.push(error);
      }

      // Report all errors at once for better debugging
      if (errors.length > 0) {
        const errorReport = errors.map(e => `  ${e.file}:\n    ${e.error}`).join('\n\n');
        throw new Error(`${errors.length} demo file(s) failed to render:\n\n${errorReport}`);
      }
    }, 120000); // 2026-07-04: the unsharded sweep took ~50s; each shard is a
                // fraction of that, budgeted for full-suite CPU load.
  });
}
