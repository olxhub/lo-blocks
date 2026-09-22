// @vitest-environment node
// packages/shared/components/blocks/layout/Course/Course.test.ts
//
// A course's loose children become flat NAVIGATION entries. That is fine for
// anything a learner reads and wrong for anything they must not see, so the
// parser skips the non-rendering content a course merely HOLDS.
//
// These tests exist because the block had none: it is used by live content, and
// a change to its child handling could have altered an existing course's
// navigation with nothing to say so.

import { parseOLX } from '@/lib/content/parseOLX';
import type { IdMap, OlxJson, ContentVariant } from '@/lib/types';
import { toMemoryRef } from '@/lib/types/storage';
import { TEST_NS } from '@/lib/test-utils';
import { qualifyDefinitionRef, parseDefinitionRef } from '@/lib/types/id-grammar';

const PROV = [toMemoryRef('test.xml')];
const get = (idMap: IdMap, id: string): OlxJson | undefined =>
  idMap[qualifyDefinitionRef(parseDefinitionRef(id), TEST_NS)]?.['*' as ContentVariant];

const sectionsOf = (node: OlxJson | undefined): any[] =>
  ((node as any)?.kids?.sections ?? []) as any[];

test('a course still lists its ordinary children as navigation', async () => {
  const xml = `<Course id="c" title="C">
      <Markdown id="intro" title="Intro">hello</Markdown>
      <Markdown id="outro" title="Outro">bye</Markdown>
    </Course>`;
  const { idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  const sections = sectionsOf(get(idMap, 'c'));
  expect(sections).toHaveLength(2);
  expect(sections.every(s => s.type === 'block')).toBe(true);
});

// NOTE: holding-without-showing is decided at RENDER now, not here. The parser
// records every child as a section; the renderer filters the internal ones. See
// _Course.tsx, and Course.render.test.tsx for the behaviour itself.
test('the parser records a rubric child as a section (the renderer filters it)', async () => {
  const xml = `<Course id="c" title="C">
      <Rubric id="r" title="R"/>
      <Markdown id="intro" title="Intro">hello</Markdown>
    </Course>`;
  const { idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  const sections = sectionsOf(get(idMap, 'c'));
  expect(sections).toHaveLength(2);
});

test('the rubric is still PARSED, so it can be referenced', async () => {
  // Skipping it from navigation must not skip registering it: a rubric nothing
  // can resolve is worse than one shown in the sidebar.
  const xml = `<Course id="c" title="C"><Rubric id="r" title="R"/></Course>`;
  const { idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(get(idMap, 'r')).toBeDefined();
});

test('chapters are unaffected', async () => {
  const xml = `<Course id="c" title="C">
      <Chapter id="ch" title="Ch"><Markdown id="m" title="M">x</Markdown></Chapter>
    </Course>`;
  const { idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  const sections = sectionsOf(get(idMap, 'c'));
  expect(sections).toHaveLength(1);
  expect(sections[0].type).toBe('chapter');
  expect(sections[0].children).toHaveLength(1);
});
