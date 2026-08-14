// @vitest-environment node
// packages/shared/lib/state/sync/levels.test.ts
//
// stateIdsForDefinition: the one filter answering "which state ids in a
// materialized component scope belong to this definition?" — scoped
// instances are only discoverable from state, never from content.

import { test, expect } from 'vitest';
import { stateIdsForDefinition } from './levels';

const component = {
  'demos/chat': { value: 'plain' },
  'demos/list:#2:chat': { value: 'scoped 2' },
  'demos/list:#7:chat': { value: 'scoped 7' },
  'demos/outer:#0:list:#1:chat': { value: 'deeply scoped' },
  'demos/notes': { value: 'other definition' },
  'demos/list:#2:notes': { value: 'other definition, scoped' },
  Tabs: { activeIndex: 0 },
};

test('the bare definition key matches itself', () => {
  expect(stateIdsForDefinition({ 'demos/chat': {} }, 'demos/chat'))
    .toEqual(['demos/chat']);
});

test('scoped instances of the definition come along, at any depth', () => {
  expect(stateIdsForDefinition(component, 'demos/chat').sort()).toEqual([
    'demos/chat',
    'demos/list:#2:chat',
    'demos/list:#7:chat',
    'demos/outer:#0:list:#1:chat',
  ]);
});

test('other definitions never match — including their scoped copies', () => {
  const out = stateIdsForDefinition(component, 'demos/chat');
  expect(out).not.toContain('demos/notes');
  expect(out).not.toContain('demos/list:#2:notes');
  // The CONTAINER is a different definition: its own key would be
  // "demos/list", and no bucket here has that leaf.
  expect(stateIdsForDefinition(component, 'demos/list')).toEqual([]);
});

test('non-StateKey ids map to themselves: they match only on equality', () => {
  expect(stateIdsForDefinition(component, 'Tabs')).toEqual(['Tabs']);
  expect(stateIdsForDefinition({ 'studio://course/f.olx': {} }, 'demos/chat'))
    .toEqual([]);
});

test('no scope (unseeded instance) → no ids', () => {
  expect(stateIdsForDefinition(undefined, 'demos/chat')).toEqual([]);
  expect(stateIdsForDefinition({}, 'demos/chat')).toEqual([]);
});
