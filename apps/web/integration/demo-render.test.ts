// apps/web/integration/demo-render.test.ts
//
// Tests that all demo .olx files in the blocks directory render without errors.
// This catches:
// - React render errors (missing props, invalid JSX, etc.)
// - Component registration issues
// - Parser/loader bugs that only manifest at render time
//
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { parseOLX } from '@/lib/content/parseOLX';
import { collectErrors } from '@/lib/content/collectErrors';
import { toMemoryRef } from '@/lib/types/storage';

import { render, makeRootNode } from '@/lib/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { Provider } from 'react-redux';
import React from 'react';
import { store } from '@/lib/state/store';
import { dispatchOlxJsonSync } from '@/lib/state/olxjson';
import { render as rtlRender, cleanup } from '@testing-library/react';
import fs from 'fs/promises';
import path from 'path';
import { injectPreviewContent } from '@/lib/template/previewTemplate';
import { getTextDirection } from '@/lib/i18n/getTextDirection';
import { mockRuntime, TEST_NS } from '@/lib/test-utils';

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

// Mock scrollTo for jsdom (Chat components use this)
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function() { };
}

// Mock fetch for content API requests - blocks not in Redux will trigger fetch
// In test environment, return error for any fetch attempts
const originalFetch = global.fetch;
global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  if (urlStr.includes('/api/olxjson/')) {
    // Return a 404 response for any content API requests
    return new Response(JSON.stringify({ ok: false, error: `Block not found (test environment)` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return originalFetch(url, options);
};

// Recursively find all .olx files in a directory
async function findOlxFiles(dir) {
  const files = [];

  async function walk(currentDir) {
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

describe('Demo OLX files render without errors', () => {
  let demoFiles = [];

  beforeAll(async () => {
    // Find all .olx files in the blocks directory
    const blocksDir = path.resolve('./packages/shared/components/blocks');
    demoFiles = await findOlxFiles(blocksDir);
  });

  it('found demo files to test', () => {
    expect(demoFiles.length).toBeGreaterThan(0);
    console.log(`Found ${demoFiles.length} demo .olx files to test`);
  });

  it('all demo files parse and render without throwing', async () => {
    const errors = [];

    // Files that intentionally render DisplayError for testing purposes
    const intentionalErrorFiles = [
      'ErrorNode.olx', // Tests the error display component itself
    ];

    for (const filePath of demoFiles) {
      const relativePath = path.relative(process.cwd(), filePath);
      const fileName = path.basename(filePath);

      // BadBlock fixtures fail on purpose (parse/render). They are asserted
      // separately in the "error-pipeline canary" suite below, which proves the
      // detection channels THIS test relies on actually fire.
      if (fileName.startsWith('BadBlock')) continue;

      // Skip files that are meant to demonstrate errors
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
              errors.push({ file: relativePath, error: result.error });
              continue;
            }
            content = result.olx;
          } else {
            errors.push({
              file: relativePath,
              error: `No sample content file found for preview (expected ${baseName}.*)`
            });
            continue;
          }
        }

        // Parse the OLX
        const parseResult = await parseOLX(content, [toMemoryRef(filePath)], undefined, TEST_NS);
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

        if (!root || !idMap[root]) {
          errors.push({
            file: relativePath,
            error: 'No root element found after parsing'
          });
          continue;
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
          errors.push({ file: relativePath, error: `Parse warning(s): ${msgs}` });
          continue;
        }

        // Create Redux store and populate with parsed content synchronously
        const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });
        dispatchOlxJsonSync(reduxStore, 'content', idMap);

        // Render the component
        const localeCode = 'en-Latn-US';
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
          React.createElement(Provider, { store: reduxStore }, element)
        );

        // Check for DisplayError components in the rendered output (skip intentional error files)
        if (!isIntentionalError) {
          const displayErrors = container.querySelectorAll('.lo-display-error');
          if (displayErrors.length > 0) {
            const errorMessages = Array.from(displayErrors).map(el => {
              const strong = el.querySelector('strong')?.textContent || 'Unknown';
              const text = el.textContent.split(':')[1]?.trim().split('\n')[0] || '';
              return `${strong}: ${text}`;
            });
            errors.push({
              file: relativePath,
              error: `DisplayError rendered: ${errorMessages.join('; ')}`
            });
          }
        }

        // Clean up
        unmount();
        cleanup();

      } catch (err) {
        // Include full stack trace for debugging
        const errorWithStack = err.stack || err.message || String(err);
        errors.push({
          file: relativePath,
          error: errorWithStack
        });
      }
    }

    // Report all errors at once for better debugging
    if (errors.length > 0) {
      const errorReport = errors.map(e => `  ${e.file}:\n    ${e.error}`).join('\n\n');
      throw new Error(`${errors.length} demo file(s) failed to render:\n\n${errorReport}`);
    }
  }, 60000); // Allow 60 seconds for all files
});

// ─────────────────────────────────────────────────────────────────────────────
// Error-pipeline canary
//
// The suite above asserts that no real block surfaces an error. But that test
// is only trustworthy if its detection channels actually fire — otherwise it is
// a "bad test" that silently passes even when rendering breaks. The BadBlock
// fixtures fail on purpose, one failure mode each, so we can assert that each
// channel is detected:
//
//   - parse-time throw   → downgraded to an ErrorNode, surfaced by collectErrors
//   - parse-time warning → result.errors is non-empty            (warnings channel,
//                                                                 now fatal above)
//   - parse ErrorNode     → collectErrors + a `.lo-display-error` render (DOM)
//   - render-time throw  → mounting throws                       (try/catch channel)
//
// The parse assertions read errors through `collectErrors` — the same in-tree
// query the app and a future MCP use — rather than scraping the DOM, so a green
// test is evidence that query works.
//
// If any of these STOP failing, the "all blocks render clean" test can no
// longer be trusted — that's what this canary catches.
// ─────────────────────────────────────────────────────────────────────────────
describe('Error-pipeline canary (BadBlock fixtures)', () => {
  const buggyDir = path.resolve('./packages/shared/components/blocks/_test');

  async function parseFixture(name: string) {
    const filePath = path.join(buggyDir, name);
    const content = await fs.readFile(filePath, 'utf-8');
    return parseOLX(content, [toMemoryRef(filePath)], undefined, TEST_NS);
  }

  function mountRoot(parsed: { idMap: any; root: string | null }) {
    const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY, websocket: false });
    dispatchOlxJsonSync(reduxStore, 'content', parsed.idMap);
    const localeCode = 'en-Latn-US';
    const runtime = mockRuntime({
      blockRegistry: BLOCK_REGISTRY,
      store: reduxStore,
      olxJsonSources: ['content'],
      locale: { code: localeCode, dir: getTextDirection(localeCode) },
    });
    const element = render({
      node: { type: 'block', id: parsed.root },
      nodeInfo: makeRootNode(runtime),
      runtime,
    });
    return rtlRender(React.createElement(Provider, { store: reduxStore }, element));
  }

  it('found BadBlock fixtures', async () => {
    const files = (await findOlxFiles(buggyDir))
      .map(f => path.basename(f))
      .filter(f => f.startsWith('BadBlock'));
    expect(files.length).toBeGreaterThan(0);
  });

  it.each([
    'BadBlockParse.olx',
    'BadBlockParseUndefined.olx',
    'BadBlockParseAppError.olx',
  ])('parse-time throw → downgraded ErrorNode, surfaced by collectErrors: %s', async (name) => {
    // A throwing parser no longer aborts the whole file; it becomes a
    // recoverable ErrorNode in the tree, which collectErrors returns.
    const parsed = await parseFixture(name);
    const errs = collectErrors(parsed.idMap);
    const id = name.replace('.olx', '');
    expect(errs.some(e => e.id.endsWith(id))).toBe(true);
    expect(errs.find(e => e.id.endsWith(id))?.type).toBe('parse_error');
  });

  it('parse-time warning is surfaced (now fatal in the main suite): BadBlockWarning.olx', async () => {
    const parsed = await parseFixture('BadBlockWarning.olx');
    expect(parsed.errors?.length ?? 0).toBeGreaterThan(0); // warning recorded
    expect(parsed.root).toBeTruthy();                       // and it still parsed
    // A non-downgrading warning keeps the block, so it is NOT in the tree —
    // collectErrors (in-tree view) does not see it; result.errors does.
    expect(collectErrors(parsed.idMap).length).toBe(0);
    const { container, unmount } = mountRoot(parsed);
    expect(container.querySelectorAll('.lo-display-error').length).toBe(0);
    unmount();
    cleanup();
  });

  it('parse error → collectErrors AND the .lo-display-error detector fire: BadBlockBadAttribute.olx', async () => {
    const parsed = await parseFixture('BadBlockBadAttribute.olx');
    // Representation channel: the in-tree query sees it…
    expect(collectErrors(parsed.idMap).length).toBeGreaterThan(0);
    // …and the display channel renders it as a DisplayError.
    const { container, unmount } = mountRoot(parsed);
    expect(container.querySelectorAll('.lo-display-error').length).toBeGreaterThan(0);
    unmount();
    cleanup();
  });

  it('malformed XML is a whole-file fatal (no tree to downgrade): BadBlockUnclosed.olx', async () => {
    // XMLValidator rejects before any tree exists, so parseOLX throws rather
    // than producing a per-block ErrorNode.
    await expect(parseFixture('BadBlockUnclosed.olx')).rejects.toBeTruthy();
  });

  it('invalid attribute VALUE → attribute_validation ErrorNode (collectErrors): BadBlockBadEnum.olx', async () => {
    const parsed = await parseFixture('BadBlockBadEnum.olx');
    const errs = collectErrors(parsed.idMap);
    expect(errs.some(e => e.type === 'attribute_validation')).toBe(true);
  });

  it('unknown tag → RENDER-time DisplayError, NOT a tree ErrorNode (gap collectErrors misses): BadBlockUnknownTag.olx', async () => {
    const parsed = await parseFixture('BadBlockUnknownTag.olx');
    expect(parsed.root).toBeTruthy();
    // Parses clean — unknown tags fall through to the default blocks parser, so
    // there is NO ErrorNode in the tree…
    expect(collectErrors(parsed.idMap).length).toBe(0);
    // …the failure shows only at render time (render.tsx "No component found"),
    // as inline DisplayError JSX — not in olxjson, so collectErrors can't see it.
    const { container, unmount } = mountRoot(parsed);
    expect(container.querySelectorAll('.lo-display-error').length).toBeGreaterThan(0);
    unmount();
    cleanup();
  });

  it('a Vertical renders fully with every parse failure downgraded inline: BadBlockVertical.olx', async () => {
    const parsed = await parseFixture('BadBlockVertical.olx');
    expect(parsed.root).toBeTruthy();
    // Four blocks fail to parse (native, undefined, typed, bad-attribute) → four
    // inline ErrorNodes; the warning + healthy + Markdown blocks stay clean.
    const errs = collectErrors(parsed.idMap);
    expect(errs.length).toBeGreaterThanOrEqual(4);
    // Crucially, the whole Vertical still mounts (parse errors are per-block) —
    // each failure shows inline rather than taking down the subtree.
    const { container, unmount } = mountRoot(parsed);
    expect(container.querySelectorAll('.lo-display-error').length).toBeGreaterThanOrEqual(4);
    unmount();
    cleanup();
  });

  it.each([
    'BadBlockRender.olx',
    'BadBlockRenderUndefined.olx',
    'BadBlockRenderAppError.olx',
  ])('render-time throw is detected: %s (parses clean, mounting throws)', async (name) => {
    const parsed = await parseFixture(name);
    expect(parsed.root).toBeTruthy(); // parsing succeeds…
    expect(() => mountRoot(parsed)).toThrow(); // …the failure is at render
  });
});
