// @vitest-environment jsdom
// src/lib/cast.integration.test.ts
//
// Integration tests for the cast-of-characters system.
//
// Exercises the full pipeline: parseOLX (with mock provider) → Redux store →
// render → Cast propthreads cast to children → TeamDirectory reads runtime.cast.
//
// These tests catch bugs where cast data fails to propagate from the <Cast>
// wrapper through to child components at render time.
//

import { describe, test, expect, afterEach } from 'vitest';
import { parseOLX } from '@/lib/content/parseOLX';
import { render, makeRootNode } from '@/lib/render';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { store } from '@/lib/state/store';
import { dispatchOlxJsonSync, CONTENT_SOURCE } from '@/lib/state/olxjson';
import { render as rtlRender, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import React from 'react';
import { getTextDirection } from '@/lib/i18n/getTextDirection';

// Mock scrollTo for jsdom (components may trigger scrolling)
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function() {};
}

// =============================================================================
// Test fixtures
// =============================================================================

const CAST_YAML = `
bob:
  name: Bob Builder
  openPeeps:
    face: smile
    head: short1
  profile:
    role: Engineer
    bio: Builds things
  groups:
    - team_a
    - engineering

alice:
  name: Alice Wonderland
  openPeeps:
    face: cute
    head: long
  profile:
    role: Designer
    bio: Designs things
  groups:
    - team_a
    - design

carol:
  name: Carol Singer
  profile:
    role: Manager
  groups:
    - team_b
`;

function makeMockProvider(files: Record<string, string>) {
  return {
    read: async (path: string) => {
      const content = files[path] ?? files[path.replace(/^\//, '')];
      if (content === undefined) throw new Error(`Mock: file not found: ${path}`);
      return { content };
    },
    resolveRelativePath: (_base: string, relative: string) => relative,
    toProvenanceURI: (path: string) => `file:test://${path}`,
    loadXmlFilesWithStats: async () => ({}),
    write: async () => {},
    update: async () => {},
    delete: async () => {},
    rename: async () => {},
    listFiles: async () => ({}),
    glob: async () => [],
    grep: async () => [],
  };
}

/** Parse OLX, load into Redux, create runtime, render, and return the container.
 *  @param renderRoot - If provided, start rendering from this ID instead of the document root.
 *                      Simulates the preview page launching from a launchable block.
 */
async function parseAndRender(olx: string, providerFiles?: Record<string, string>, renderRoot?: string) {
  const provider = providerFiles ? makeMockProvider(providerFiles) : undefined;
  const { idMap, root } = await parseOLX(olx, ['file:test://test.olx'], provider);

  if (!root) throw new Error('No root element found after parsing');
  const renderId = renderRoot ?? root;

  const reduxStore = store.init({ blockRegistry: BLOCK_REGISTRY });
  dispatchOlxJsonSync(reduxStore, CONTENT_SOURCE, idMap);

  const localeCode = 'en-Latn-US';
  const runtime = {
    blockRegistry: BLOCK_REGISTRY,
    store: reduxStore,
    logEvent: () => {},
    sideEffectFree: false,
    olxJsonSources: [CONTENT_SOURCE],
    idPrefix: '' as any,
    locale: { code: localeCode, dir: getTextDirection(localeCode) },
  };

  const element = render({
    node: { type: 'block', id: renderId },
    nodeInfo: makeRootNode(runtime),
    runtime,
  });

  return rtlRender(
    React.createElement(Provider, { store: reduxStore }, element)
  );
}

// =============================================================================
// Cast → TeamDirectory propthreading
// =============================================================================
//
// The <Cast> block loads a .cast file at parse time, then propthreads the
// parsed cast data to children via runtime.cast. TeamDirectory reads
// runtime.cast and filters by group.
//
// Input:
//   <Cast cast="test.cast">                   ← loads YAML, stores in attributes
//     <TeamDirectory group="team_a"/>          ← reads from runtime.cast
//   </Cast>
//
// Expected: TeamDirectory shows bob and alice (team_a), not carol (team_b).

describe('Cast → TeamDirectory propthreading', () => {
  afterEach(() => cleanup());

  test('TeamDirectory shows members from the cast, filtered by group', async () => {
    const olx = `
      <Cast id="cast_render_test" cast="test.cast">
        <TeamDirectory id="dir_render_test" group="team_a" title="Team A"/>
      </Cast>
    `;

    const { container } = await parseAndRender(olx, { 'test.cast': CAST_YAML });

    // team_a members should appear
    expect(container.textContent).toContain('Bob Builder');
    expect(container.textContent).toContain('Alice Wonderland');

    // team_b members should NOT appear
    expect(container.textContent).not.toContain('Carol Singer');

    // Should NOT show the empty-state message
    expect(container.textContent).not.toContain('No team members found');
  });

  test('TeamDirectory with no group shows all cast members', async () => {
    const olx = `
      <Cast id="cast_all_test" cast="test.cast">
        <TeamDirectory id="dir_all_test" title="Everyone"/>
      </Cast>
    `;

    const { container } = await parseAndRender(olx, { 'test.cast': CAST_YAML });

    expect(container.textContent).toContain('Bob Builder');
    expect(container.textContent).toContain('Alice Wonderland');
    expect(container.textContent).toContain('Carol Singer');
  });

  test('TeamDirectory without Cast wrapper shows empty state', async () => {
    const olx = `
      <TeamDirectory id="dir_no_cast_test" group="team_a" title="No Cast"/>
    `;

    const { container } = await parseAndRender(olx);

    expect(container.textContent).toContain('No team members found');
  });

  test('Cast propthreads through intermediate layout blocks', async () => {
    // Cast → Vertical → TeamDirectory (cast must flow through Vertical)
    const olx = `
      <Cast id="cast_nested_test" cast="test.cast">
        <Vertical id="wrapper">
          <TeamDirectory id="dir_nested_test" group="team_a" title="Nested"/>
        </Vertical>
      </Cast>
    `;

    const { container } = await parseAndRender(olx, { 'test.cast': CAST_YAML });

    expect(container.textContent).toContain('Bob Builder');
    expect(container.textContent).toContain('Alice Wonderland');
    expect(container.textContent).not.toContain('Carol Singer');
  });
});

// =============================================================================
// Launchable block scenario (preview page)
// =============================================================================
//
// When the preview page renders a launchable block, it starts rendering from
// that block's ID — NOT from the document root. If the <Cast> wrapper is
// an ancestor of the launchable but not part of the launchable's subtree,
// runtime.cast is never populated.
//
// Solution: blocks that need cast data should have their own cast= attribute,
// or the <Cast> wrapper should be inside the launchable's subtree.

describe('Launchable block: rendering from non-root ID', () => {
  afterEach(() => cleanup());

  test('Cast wrapper above launchable does NOT propthread (root cause of the bug)', async () => {
    // <Cast> wraps the SplitPanel, but preview renders from the SplitPanel.
    // Cast never executes → runtime.cast is undefined → TeamDirectory shows empty state.
    const olx = `
      <Cast id="cast_above" cast="test.cast">
        <Vertical id="vert_above">
          <TeamDirectory id="dir_above" group="team_a" title="Above"/>
        </Vertical>
      </Cast>
    `;

    // Render from the Vertical (simulating preview starting from launchable)
    const { container } = await parseAndRender(olx, { 'test.cast': CAST_YAML }, 'vert_above');

    // The Cast block is above the render root — it never runs.
    // TeamDirectory gets no runtime.cast → shows empty state.
    expect(container.textContent).toContain('No team members found');
  });

  test('TeamDirectory with own cast= attribute works without Cast wrapper', async () => {
    // The fix: TeamDirectory loads its own cast file at parse time.
    const olx = `
      <Vertical id="vert_direct">
        <TeamDirectory id="dir_direct" group="team_a" title="Direct" cast="test.cast"/>
      </Vertical>
    `;

    const { container } = await parseAndRender(olx, { 'test.cast': CAST_YAML });

    expect(container.textContent).toContain('Bob Builder');
    expect(container.textContent).toContain('Alice Wonderland');
    expect(container.textContent).not.toContain('Carol Singer');
    expect(container.textContent).not.toContain('No team members found');
  });

  test('TeamDirectory with own cast= attribute works when rendered from non-root', async () => {
    // Full scenario: Cast wrapper + direct cast= on TeamDirectory.
    // Rendering from the Vertical (launchable), not from Cast wrapper.
    const olx = `
      <Cast id="cast_outer" cast="test.cast">
        <Vertical id="vert_launch">
          <TeamDirectory id="dir_launch" group="team_a" title="Launch" cast="test.cast"/>
        </Vertical>
      </Cast>
    `;

    // Render from the Vertical, bypassing the Cast wrapper
    const { container } = await parseAndRender(olx, { 'test.cast': CAST_YAML }, 'vert_launch');

    // TeamDirectory has its own cast= → works even without Cast wrapper in render tree
    expect(container.textContent).toContain('Bob Builder');
    expect(container.textContent).toContain('Alice Wonderland');
    expect(container.textContent).not.toContain('Carol Singer');
  });
});
