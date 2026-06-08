// packages/shared/components/blocks/CapaProblem/CapaProblem.test.ts
//
// Unit tests for CapaProblem parser behavior.
// Render tests are covered by demo-render.test.js which tests all .olx files.
//
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import { getOlxJson, TEST_NS, testKey } from '@/lib/test-utils';
import { asDefinitionKey } from '@/lib/types/id-grammar';

it('wires inputs and graders with explicit targeting', async () => {
  const { idMap } = await syncContentFromStorage(new FileStorageProvider('packages/shared/components/blocks/CapaProblem'));
  const root = idMap[testKey('CapaProblemTargeting')];
  expect(root).toBeDefined();

  // RatioGrader with explicit target="num,den"
  const graderId = 'CapaProblemTargeting_grader_0';
  expect(getOlxJson(idMap, graderId)).toBeDefined();
  expect(getOlxJson(idMap, 'num')).toBeDefined();
  expect(getOlxJson(idMap, 'den')).toBeDefined();

  // Grader should have target wired to the two inputs
  expect(getOlxJson(idMap, graderId).attributes.target).toEqual(['num', 'den']);

  // Render-time controls should NOT be injected into idMap by the parser
  expect(Object.keys(idMap)).not.toContain(testKey('CapaProblemTargeting_button'));
  expect(Object.keys(idMap)).not.toContain(testKey('CapaProblemTargeting_correctness'));
});

it('auto-wires grader target from nested inputs', async () => {
  // CapaProblem.olx: NumericalGrader with NumberInput nested inside (no explicit target).
  // The parser should auto-wire the grader's target to the nested input using bare refs,
  // not namespace-qualified DefinitionKeys (which would cause double-qualification downstream).
  const { idMap } = await syncContentFromStorage(new FileStorageProvider('packages/shared/components/blocks/CapaProblem'));

  const grader = getOlxJson(idMap, 'CapaProblemDemo_grader_0');
  expect(grader).toBeDefined();
  expect(grader.tag).toBe('NumericalGrader');

  const input = getOlxJson(idMap, 'CapaProblemDemo_input_0');
  expect(input).toBeDefined();
  expect(input.tag).toBe('NumberInput');

  // Auto-wired target should be a bare ref string (comma-separated), not qualified.
  // The post-parse grader validation in parseOLX qualifies these for idMap lookup —
  // if we stored DefinitionKeys here, they'd get double-qualified to CONTENT/CONTENT/...
  expect(grader.attributes.target).toBe('CapaProblemDemo_input_0');
});
