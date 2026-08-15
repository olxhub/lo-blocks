// @vitest-environment node
// packages/shared/lib/state/sync/contentState.test.ts
//
// fieldStateForIds: the filter picking which of a caller's component
// buckets ride a content response (fields-design step 2b).

import { test, expect } from 'vitest';
import { fieldStateForIds } from './contentState';

const scopes = {
  system: { locale: 'en' },
  component: {
    'course/page1': { seen: true },
    'course/list:#0:page1': { value: 'scoped instance' },
    'course/page2': { value: 'other page' },
    Tabs: { activeIndex: 0 },
  },
  componentSetting: {},
};

test('exact ids are included', () => {
  const out = fieldStateForIds(scopes, ['course/page1']);
  expect(Object.keys(out!.component)).toEqual(['course/page1']);
});

test('scoped instances ride along when their whole chain is served', () => {
  // The fetch renders the list AND its kid, so the kid's per-list copies
  // belong on screen. Serving the kid alone does not drag them in — the
  // caller is not rendering that list.
  const out = fieldStateForIds(scopes, ['course/list', 'course/page1']);
  expect(Object.keys(out!.component).sort())
    .toEqual(['course/list:#0:page1', 'course/page1']);
  expect(fieldStateForIds(scopes, ['course/page1'])!.component['course/list:#0:page1'])
    .toBeUndefined();
});

test('ids that are not state keys match only themselves', () => {
  expect(Object.keys(fieldStateForIds(scopes, ['Tabs'])!.component)).toEqual(['Tabs']);
});

test('unrelated buckets and other scopes never leak', () => {
  const out = fieldStateForIds(scopes, ['course/page1']);
  expect(out!.component['course/page2']).toBeUndefined();
  expect((out as any).system).toBeUndefined();
});

test('no matching state → null (key omitted from the response)', () => {
  expect(fieldStateForIds(scopes, ['course/never-seen'])).toBeNull();
  expect(fieldStateForIds(null, ['course/page1'])).toBeNull();
});
