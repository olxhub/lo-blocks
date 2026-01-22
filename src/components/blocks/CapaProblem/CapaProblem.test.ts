// src/components/blocks/CapaProblem/CapaProblem.test.js
//
// Unit tests for CapaProblem parser behavior.
// Render tests are covered by demo-render.test.js which tests all .olx files.
//
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { FileStorageProvider } from '@/lib/lofs/providers/file';

it('wires inputs and graders with explicit targeting', async () => {
  const { idMap } = await syncContentFromStorage(new FileStorageProvider('src/components/blocks/CapaProblem'));
  const root = idMap['CapaProblemTargeting'];
  expect(root).toBeDefined();

  // RatioGrader with explicit target="num,den"
  const graderId = 'CapaProblemTargeting_grader_0';
  expect(idMap[graderId]).toBeDefined();
  expect(idMap['num']).toBeDefined();
  expect(idMap['den']).toBeDefined();

  // Grader should have target wired to the two inputs
  expect(idMap[graderId].attributes.target).toBe('num,den');

  // Render-time controls should NOT be injected into idMap by the parser
  expect(Object.keys(idMap)).not.toContain('CapaProblemTargeting_button');
  expect(Object.keys(idMap)).not.toContain('CapaProblemTargeting_correctness');
});
