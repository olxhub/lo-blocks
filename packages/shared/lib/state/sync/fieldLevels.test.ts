// @vitest-environment node
// makeSharedFieldPolicyIndex: only level>user declarations are indexed (absence
// = level 'user', fail closed), scoped keys share their LEAF
// definition's declaration — but only when their whole definition CHAIN
// exists in content and nests — delivery defaults to 'events'.

import { test, expect } from 'vitest';
import { makeSharedFieldPolicyIndex } from './fieldLevels';

// Content shaped like the real thing: a scoping container's kid is a
// wrapper, not the scoped block itself (DynamicList's template is
// typically a Vertical), and kid ids come qualified from OLX parsing or
// bare from generated content.
const block = (id: string) => ({ type: 'block', id });
const idMap = {
  'demos/notes': { v1: { tag: 'SharedNotes' } },
  'demos/q': { v1: { tag: 'TextInput' } },
  'demos/dist': { v1: { tag: 'AnswerDistribution' } },
  // list → (html) → row → notes
  'demos/list': { v1: { tag: 'DynamicList', kids: [{ type: 'html', tag: 'div', kids: [block('demos/row')] }] } },
  'demos/row': { v1: { tag: 'Vertical', kids: [block('notes')] } },  // bare kid ref
  // A real definition that does NOT contain notes.
  'demos/other': { v1: { tag: 'Vertical', kids: [block('demos/q')] } },
  // Container-in-container, plus a direct (unwrapped) kid.
  'demos/outer': { v1: { tag: 'DynamicList', kids: [block('demos/list')] } },
  'demos/panel': { v1: { tag: 'Vertical', kids: [block('demos/dist')] } },
  // <Use> lets content cycle; the containment walk must terminate.
  'demos/loopA': { v1: { tag: 'Vertical', kids: [block('demos/loopB')] } },
  'demos/loopB': { v1: { tag: 'Vertical', kids: [block('demos/loopA')] } },
};

const fieldsForTag = (tag: string) =>
  ({
    SharedNotes: { notes: { name: 'notes', level: 'everyone' } },
    TextInput: { value: { name: 'value' } }, // no level → 'user'
    AnswerDistribution: {
      distribution: { name: 'distribution', level: 'everyone', delivery: 'folded' },
    },
  } as any)[tag];

const makeIndex = () => makeSharedFieldPolicyIndex(async () => idMap, fieldsForTag);

test('declared levels resolve; undeclared fields are level user', async () => {
  const index = makeIndex();
  expect(await index.sharedPolicyFor('demos/notes', 'notes'))
    .toEqual({ level: 'everyone', delivery: 'events' });
  expect(await index.sharedPolicyFor('demos/dist', 'distribution'))
    .toEqual({ level: 'everyone', delivery: 'folded' });
  expect(await index.sharedPolicyFor('demos/q', 'value')).toBeUndefined();
  expect(await index.sharedPolicyFor('demos/unknown', 'value')).toBeUndefined();
});

test('scoped state keys share their LEAF definition declaration', async () => {
  const index = makeIndex();
  // A notes block rendered inside a dynamic container: the instance is
  // scoped ("list:#2:"), the declaration lives on demos/notes. The list
  // reaches its notes through a wrapper, as real content does.
  expect(await index.sharedPolicyFor('demos/list:#2:notes', 'notes'))
    .toEqual({ level: 'everyone', delivery: 'events' });
  // A directly-declared kid resolves the same way.
  expect(await index.sharedPolicyFor('demos/panel:#0:dist', 'distribution'))
    .toEqual({ level: 'everyone', delivery: 'folded' });
  // Container declarations do NOT govern children: a scoped key whose
  // leaf has no declaration is level user even under a declared parent.
  expect(await index.sharedPolicyFor('demos/notes:#0:q', 'value')).toBeUndefined();
});

test('a scoped key whose container is fabricated routes as level user', async () => {
  const index = makeIndex();
  // The attack: any syntactically valid chain ending in a declared-shared
  // leaf used to be granted the shared policy, so a client could invent
  // containers at will and mint persistent shared buckets.
  expect(await index.sharedPolicyFor('demos/anything:#x:notes', 'notes')).toBeUndefined();
  // Same for a fabricated NAMESPACE around a real-looking chain.
  expect(await index.sharedPolicyFor('elsewhere/list:#2:notes', 'notes')).toBeUndefined();
});

test('a real container that does not contain the leaf routes as level user', async () => {
  const index = makeIndex();
  expect(await index.sharedPolicyFor('demos/other:#0:notes', 'notes')).toBeUndefined();
  // ...even though the same leaf under its real container is shared.
  expect(await index.sharedPolicyFor('demos/list:#0:notes', 'notes'))
    .toEqual({ level: 'everyone', delivery: 'events' });
});

test('deep chains are validated link by link', async () => {
  const index = makeIndex();
  // outer → list → (wrapper) → notes: every link holds.
  expect(await index.sharedPolicyFor('demos/outer:#0:list:#1:notes', 'notes'))
    .toEqual({ level: 'everyone', delivery: 'events' });
  // Broken in the middle: outer does not contain other (both ends real).
  expect(await index.sharedPolicyFor('demos/outer:#0:other:#1:notes', 'notes')).toBeUndefined();
  // Broken at the top: the outermost container is invented.
  expect(await index.sharedPolicyFor('demos/nope:#0:list:#1:notes', 'notes')).toBeUndefined();
  // A cyclic region terminates and still fails closed on a foreign leaf.
  expect(await index.sharedPolicyFor('demos/loopA:#0:notes', 'notes')).toBeUndefined();
});

test('non-StateKey ids (setting tags, legacy dialects) fail closed', async () => {
  const index = makeIndex();
  expect(await index.sharedPolicyFor('Tabs', 'open')).toBeUndefined();
  // The pre-id-grammar '#'-suffix dialect is dead (nothing produces it);
  // if such an id ever arrives it routes as level user, never shared.
  expect(await index.sharedPolicyFor('demos/notes#row3', 'notes')).toBeUndefined();
});
