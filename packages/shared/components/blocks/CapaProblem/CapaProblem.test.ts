// src/components/blocks/CapaProblem/CapaProblem.test.js
//
// Unit tests for CapaProblem parser behavior.
// Render tests are covered by demo-render.test.js which tests all .olx files.
//
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import { getOlxJson } from '@/lib/test-utils';

it('wires inputs and graders with explicit targeting', async () => {
  const { idMap } = await syncContentFromStorage(new FileStorageProvider('packages/shared/components/blocks/CapaProblem'));
  const root = idMap['CapaProblemTargeting'];
  expect(root).toBeDefined();

  // RatioGrader with explicit target="num,den"
  const graderId = 'CapaProblemTargeting_grader_0';
  expect(getOlxJson(idMap, graderId)).toBeDefined();
  expect(getOlxJson(idMap, 'num')).toBeDefined();
  expect(getOlxJson(idMap, 'den')).toBeDefined();

  // Grader should have target wired to the two inputs
  expect(getOlxJson(idMap, graderId).attributes.target).toEqual(['num', 'den']);

  // Render-time controls should NOT be injected into idMap by the parser
  expect(Object.keys(idMap)).not.toContain('CapaProblemTargeting_button');
  expect(Object.keys(idMap)).not.toContain('CapaProblemTargeting_correctness');
});
