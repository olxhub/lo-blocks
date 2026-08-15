// @vitest-environment node
// packages/shared/lib/state/sync/levels.test.ts
//
// indexScopeByLeafDefinition: the one index answering "which state ids in
// a materialized component scope belong to this definition?" — scoped
// instances are only discoverable from state, never from content.

import { test, expect } from 'vitest';
import { indexScopeByLeafDefinition } from './levels';

const component = {
  'demos/chat': { value: 'plain' },
  'demos/list:#2:chat': { value: 'scoped 2' },
  'demos/list:#7:chat': { value: 'scoped 7' },
  'demos/outer:#0:list:#1:chat': { value: 'deeply scoped' },
  'demos/notes': { value: 'other definition' },
  'demos/list:#2:notes': { value: 'other definition, scoped' },
  Tabs: { activeIndex: 0 },
};

/** What a caller asks the index: the state ids of one definition. */
const idsOf = (scope: Record<string, unknown> | undefined, definitionId: string) =>
  indexScopeByLeafDefinition(scope).get(definitionId) ?? [];

test('the bare definition key indexes under itself', () => {
  expect(idsOf({ 'demos/chat': {} }, 'demos/chat')).toEqual(['demos/chat']);
});

test('scoped instances of the definition come along, at any depth', () => {
  expect(idsOf(component, 'demos/chat').sort()).toEqual([
    'demos/chat',
    'demos/list:#2:chat',
    'demos/list:#7:chat',
    'demos/outer:#0:list:#1:chat',
  ]);
});

test('other definitions never match — including their scoped copies', () => {
  const out = idsOf(component, 'demos/chat');
  expect(out).not.toContain('demos/notes');
  expect(out).not.toContain('demos/list:#2:notes');
  // The CONTAINER is a different definition: its own key would be
  // "demos/list", and no bucket here has that leaf.
  expect(idsOf(component, 'demos/list')).toEqual([]);
  // Each definition gets its own bucket in the same one-pass index.
  expect(idsOf(component, 'demos/notes').sort())
    .toEqual(['demos/list:#2:notes', 'demos/notes']);
});

test('non-StateKey ids index as themselves: they are found only by equality', () => {
  expect(idsOf(component, 'Tabs')).toEqual(['Tabs']);
  expect(idsOf({ 'studio://course/f.olx': {} }, 'demos/chat')).toEqual([]);
  expect(idsOf({ 'studio://course/f.olx': {} }, 'studio://course/f.olx'))
    .toEqual(['studio://course/f.olx']);
});

test('no scope (unseeded instance) → empty index', () => {
  expect(indexScopeByLeafDefinition(undefined).size).toBe(0);
  expect(indexScopeByLeafDefinition({}).size).toBe(0);
  expect(idsOf(undefined, 'demos/chat')).toEqual([]);
});
