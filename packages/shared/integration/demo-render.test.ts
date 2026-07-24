// @vitest-environment jsdom
// packages/shared/integration/demo-render.test.ts
//
// Coverage guardrail + error-pipeline canary for the demo-render sweep.
//
// The sweep itself — parse and mount every .olx example under
// packages/shared/components/blocks — is SHARDED across the sibling
// demo-render.<shard>.test.ts files so vitest can parallelize it (see
// demoRenderHarness.ts). This file asserts the shards jointly cover every
// block category on disk, and hosts the canary suite proving the sweep's
// error-detection channels actually fire.
//
import { describe, it, expect, beforeAll } from 'vitest';
import { parseOLX } from '@/lib/content/parseOLX';
import { collectErrors } from '@/lib/content/collectErrors';
import { toMemoryRef } from '@/lib/types/storage';

import { render, makeRootNode } from '@/lib/player/client/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { preloadBlockComponents } from '@/lib/blocks/loader/componentLoader';
import { Provider } from 'react-redux';
import React from 'react';
import { store } from '@/lib/state/store';
import { dispatchOlxJsonSync } from '@/lib/state/olxjson';
import { render as rtlRender, cleanup } from '@testing-library/react';
import fs from 'fs/promises';
import path from 'path';
import { getTextDirection } from '@/lib/i18n/getTextDirection';
import { mockRuntime, TEST_NS } from '@/lib/test-utils';
// Side effects: jsdom shims + fetch mock, shared with the shards.
import { DEMO_RENDER_SHARDS, BLOCKS_DIR, findOlxFiles } from './demoRenderHarness';

// Components are lazy; the canary mounts blocks and asserts synchronously.
beforeAll(async () => {
  await preloadBlockComponents(Object.values(BLOCK_REGISTRY));
}, 60_000);

// ─────────────────────────────────────────────────────────────────────────────
// Shard coverage guardrail
//
// Sharding must never silently drop coverage: every top-level block
// directory that contains .olx examples must be assigned to exactly one
// shard. Adding a new category fails here until it gets a shard.
describe('demo-render shards cover every block category', () => {
  it('every category with .olx files is in exactly one shard', async () => {
    const all = await findOlxFiles(BLOCKS_DIR);
    const categoriesOnDisk = new Set(
      all.map(f => path.relative(BLOCKS_DIR, f).split(path.sep)[0])
        .filter(seg => !seg.endsWith('.olx'))  // files directly in blocks/ have no category dir
    );

    const assigned = Object.values(DEMO_RENDER_SHARDS).flat();
    const assignedSet = new Set(assigned);
    expect(assigned.length).toBe(assignedSet.size);  // no category in two shards

    const uncovered = [...categoriesOnDisk].filter(c => !assignedSet.has(c));
    expect(uncovered, 
      `Block categories with .olx examples not covered by any demo-render shard: ` +
      `${uncovered.join(', ')}. Add them to DEMO_RENDER_SHARDS in demoRenderHarness.ts.`
    ).toEqual([]);

    // Root-level .olx files (no category directory) would escape every shard.
    const rootFiles = all.filter(f => !path.relative(BLOCKS_DIR, f).includes(path.sep));
    expect(rootFiles).toEqual([]);
  });
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
