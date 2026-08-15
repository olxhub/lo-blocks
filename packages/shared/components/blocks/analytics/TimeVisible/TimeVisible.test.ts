import { expect, it } from 'vitest';
import { parseOLX } from '@/lib/content/parseOLX';
import { getOlxJson, TEST_NS, testKey } from '@/lib/test-utils';
import { toMemoryRef } from '@/lib/types/storage';

const PROVENANCE = [toMemoryRef('time-visible.test.olx')];

it('wraps exactly one measured child', async () => {
  const { idMap, errors } = await parseOLX(
    '<TimeVisible id="timer"><TextArea id="draft"/></TimeVisible>',
    PROVENANCE,
    undefined,
    TEST_NS,
  );

  expect(errors).toEqual([]);
  expect(getOlxJson(idMap, 'timer')?.kids).toEqual([
    { type: 'block', definitionKey: testKey('draft') },
  ]);
});

it('rejects marker-style use without a measured child', async () => {
  const { errors } = await parseOLX(
    '<TimeVisible id="timer"/>',
    PROVENANCE,
    undefined,
    TEST_NS,
  );

  expect(errors[0]?.message).toContain(
    '<TimeVisible> requires exactly 1 block children, got 0',
  );
});
