// @vitest-environment node
// The content generation signal + generationMemo: a memoised build re-runs
// only after the generation bumps, and returns the cached value otherwise.

import { test, expect } from 'vitest';
import {
  contentGeneration,
  bumpContentGeneration,
  onGeneration,
  generationMemo,
} from './generation';

test('bumpContentGeneration increments and notifies subscribers', () => {
  const before = contentGeneration();
  const seen: number[] = [];
  const unsubscribe = onGeneration((g) => seen.push(g));

  const after = bumpContentGeneration();
  expect(after).toBe(before + 1);
  expect(contentGeneration()).toBe(after);
  expect(seen).toEqual([after]);

  unsubscribe();
  bumpContentGeneration();
  expect(seen).toEqual([after]); // no more notifications after unsubscribe
});

test('generationMemo rebuilds only when the generation changes', async () => {
  let builds = 0;
  const load = generationMemo(async () => {
    builds++;
    return `build-${builds}`;
  });

  const a = await load();
  const b = await load();
  expect(a).toBe('build-1');
  expect(b).toBe('build-1'); // cached — no rebuild
  expect(builds).toBe(1);

  bumpContentGeneration();
  const c = await load();
  expect(c).toBe('build-2'); // rebuilt after the bump
  expect(builds).toBe(2);
});

test('generationMemo single-flights concurrent rebuilds', async () => {
  let builds = 0;
  const load = generationMemo(async () => {
    builds++;
    await new Promise((r) => setTimeout(r, 5));
    return builds;
  });

  const [x, y] = await Promise.all([load(), load()]);
  expect(x).toBe(1);
  expect(y).toBe(1);
  expect(builds).toBe(1); // one shared build, not two
});
