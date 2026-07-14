// @vitest-environment node
// makeFieldLevelIndex: only level>user declarations are indexed (absence
// = level 'user', fail closed), scoped keys share their definition's
// declaration, delivery defaults to 'events'.

import { test, expect } from 'vitest';
import { makeFieldLevelIndex } from './fieldLevels';

const idMap = {
  'demos/notes': { v1: { tag: 'SharedNotes' } },
  'demos/q': { v1: { tag: 'TextInput' } },
  'demos/dist': { v1: { tag: 'AnswerDistribution' } },
};

const fieldsForTag = (tag: string) =>
  ({
    SharedNotes: { notes: { name: 'notes', level: 'everyone' } },
    TextInput: { value: { name: 'value' } }, // no level → 'user'
    AnswerDistribution: {
      distribution: { name: 'distribution', level: 'everyone', delivery: 'folded' },
    },
  } as any)[tag];

test('declared levels resolve; undeclared fields are level user', async () => {
  const index = makeFieldLevelIndex(async () => idMap, fieldsForTag);
  expect(await index.levelOf('demos/notes', 'notes'))
    .toEqual({ level: 'everyone', delivery: 'events' });
  expect(await index.levelOf('demos/dist', 'distribution'))
    .toEqual({ level: 'everyone', delivery: 'folded' });
  expect(await index.levelOf('demos/q', 'value')).toBeUndefined();
  expect(await index.levelOf('demos/unknown', 'value')).toBeUndefined();
});

test('scoped state keys share their LEAF definition declaration', async () => {
  const index = makeFieldLevelIndex(async () => idMap, fieldsForTag);
  // A notes block rendered inside a dynamic container: the instance is
  // scoped ("list:#2:"), the declaration lives on demos/notes.
  expect(await index.levelOf('demos/list:#2:notes', 'notes'))
    .toEqual({ level: 'everyone', delivery: 'events' });
  // Container declarations do NOT govern children: a scoped key whose
  // leaf has no declaration is level user even under a declared parent.
  expect(await index.levelOf('demos/notes:#0:q', 'value')).toBeUndefined();
});

test('non-StateKey ids (setting tags, legacy dialects) fail closed', async () => {
  const index = makeFieldLevelIndex(async () => idMap, fieldsForTag);
  expect(await index.levelOf('Tabs', 'open')).toBeUndefined();
  // The pre-id-grammar '#'-suffix dialect is dead (nothing produces it);
  // if such an id ever arrives it routes as level user, never shared.
  expect(await index.levelOf('demos/notes#row3', 'notes')).toBeUndefined();
});
