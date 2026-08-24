// packages/shared/lib/state/envelopeFold.test.ts
//
// The plain-spread fallback for an event with no registered reducer. An LWW
// envelope is transport metadata, not state; only its named value belongs in
// the bucket.

import { test, expect, beforeEach } from 'vitest';
import { updateResponseReducer, initReducers } from './store';
import { scopes } from './scopes';

// A registry with NO fields at all: every event below takes the fallback.
beforeEach(() => { initReducers({}, []); });

const fold = (state: any, action: any) => updateResponseReducer(state, action);

test('an unregistered LWW write stores its value, not its envelope', () => {
  const next = fold({ system: {} }, {
    event: 'SET_LOCALE', scope: scopes.system, field: 'locale',
    locale: { code: 'en', dir: 'ltr' }, ts: 1787594521907,
    actor: 'c56ac7e2-ede3-405b-951c-d2019f7c20aa',
  });
  expect(next.system).toEqual({ locale: { code: 'en', dir: 'ltr' } });
  // The exact keys that became character maps in the field store.
  expect(next.system).not.toHaveProperty('field');
  expect(next.system).not.toHaveProperty('ts');
  expect(next.system).not.toHaveProperty('actor');
});

test.skip('TODO: an unregistered LWW write preserves normalized ordering metadata', () => {
  const next = fold({ system: {} }, {
    event: 'SET_LOCALE', scope: scopes.system, field: 'locale',
    locale: { code: 'en', dir: 'ltr' }, ts: 10, actor: 'browser-a',
  });
  expect(next.system).toEqual({
    locale: { code: 'en', dir: 'ltr' },
    'locale.ts': 10,
    'locale.actor': 'browser-a',
  });
});

test('the same holds in component scope — it is the shape, not the scope', () => {
  // A block field whose event nothing registered: the case a new block
  // creates the moment its field list and the server registry disagree.
  const next = fold({ component: {} }, {
    event: 'SET_RUBRIC', scope: scopes.component, id: 'blk', field: 'rubric',
    rubric: { a: 1 }, ts: 5, actor: 'someone',
  });
  expect(next.component.blk).toEqual({ rubric: { a: 1 } });
});

test('successive unregistered writes to different fields do not collide', () => {
  // A bucket must not retain one shared, unprefixed metadata triple.
  let state: any = { system: {} };
  state = fold(state, {
    event: 'SET_THEME_BRAND', scope: scopes.system, field: 'themeBrand',
    themeBrand: 'example-brand', ts: 1, actor: 'a',
  });
  state = fold(state, {
    event: 'SET_LOCALE', scope: scopes.system, field: 'locale',
    locale: { code: 'en' }, ts: 2, actor: 'a',
  });
  expect(state.system).toEqual({ themeBrand: 'example-brand', locale: { code: 'en' } });
});

test('an event that merely CARRIES a ts keeps it — only the envelope shape is stripped', () => {
  // VIDEO_TIME_EVENT and friends have no `field`, so `ts` is their data.
  const next = fold({ component: {} }, {
    event: 'VIDEO_TIME_EVENT', scope: scopes.component, id: 'vid', ts: 12.5,
  });
  expect(next.component.vid).toEqual({ ts: 12.5 });
});

test('a `field` that does not name a key in the payload is left alone', () => {
  // Not an LWW envelope — some other event that happens to say `field`.
  const next = fold({ component: {} }, {
    event: 'SOMETHING', scope: scopes.component, id: 'blk', field: 'a-label',
  });
  expect(next.component.blk).toEqual({ field: 'a-label' });
});
