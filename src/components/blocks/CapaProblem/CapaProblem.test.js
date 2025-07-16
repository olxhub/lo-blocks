// src/components/blocks/CapaProblem/CapaProblem.test.js
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { FileStorageProvider } from '@/lib/storage';

it('wires inputs and graders with default IDs', async () => {
  const { idMap } = await syncContentFromStorage(new FileStorageProvider('content/demos'));
  const root = idMap['CapaDemo'];
  expect(root).toBeDefined();

  const graderId = 'CapaDemoRatio_grader_0';
  const inputId0 = 'CapaDemoRatio_input_0';
  const inputId1 = 'CapaDemoRatio_input_1';
  const buttonId = 'CapaDemoRatio_button';
  const correctId = 'CapaDemoRatio_correctness';

  expect(idMap[graderId]).toBeDefined();
  expect(idMap[inputId0]).toBeDefined();
  expect(idMap[inputId1]).toBeDefined();
  expect(idMap[buttonId]).toBeDefined();
  expect(idMap[correctId]).toBeDefined();

  const grader = idMap[graderId];
  const hasP = grader.kids.some(k => k.type === 'html' && k.tag === 'p');
  expect(hasP).toBe(true);

  expect(idMap[graderId].attributes.targets).toBe(
    `${inputId0},${inputId1}`
  );
  expect(idMap[buttonId].attributes.targets).toBe(graderId);
  expect(idMap[correctId].attributes.targets).toBe(graderId);
});
