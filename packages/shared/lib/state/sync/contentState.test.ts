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
    'course/page1#attempt_0': { value: 'scoped child' },
    'course/page2': { value: 'other page' },
  },
  componentSetting: {},
};

test('exact ids and their scoped variants are included', () => {
  const out = fieldStateForIds(scopes, ['course/page1']);
  expect(Object.keys(out!.component).sort()).toEqual([
    'course/page1', 'course/page1#attempt_0',
  ]);
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
