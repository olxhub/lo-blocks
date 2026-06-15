// packages/shared/components/blocks/CapaProblem/CapaProblem.test.ts
//
// Unit tests for CapaProblem parser behavior.
// Render tests are covered by demo-render.test.js which tests all .olx files.
//
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { parseOLX } from '@/lib/content/parseOLX';
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import { toMemoryRef } from '@/lib/types/storage';
import { getOlxJson, TEST_NS, testKey } from '@/lib/test-utils';
import { asDefinitionKey } from '@/lib/types/id-grammar';

it('wires inputs and graders with explicit targeting', async () => {
  // Test-fixture mount: example files sit at the provider root, so there is
  // no directory or manifest for namespaceFor to derive a namespace from —
  // override it explicitly.
  const { idMap } = await syncContentFromStorage(
    new FileStorageProvider('packages/shared/components/blocks/CapaProblem', undefined, { ns: TEST_NS })
  );
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
  const { idMap } = await syncContentFromStorage(
    new FileStorageProvider('packages/shared/components/blocks/CapaProblem', undefined, { ns: TEST_NS })
  );

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

it('accepts and preserves the submitLabel button override', async () => {
  // submitLabel overrides the footer's computed Check/Submit label. The strict
  // attribute schema must accept it, and the parser must keep it on the node so
  // _CapaProblem can forward it to CapaFooter's `label`.
  const xml = `<CapaProblem id="q" title="Capital" submitLabel="Verify">
    <KeyGrader>
      <ChoiceInput>
        <Key>Paris</Key>
        <Distractor>Lyon</Distractor>
      </ChoiceInput>
    </KeyGrader>
  </CapaProblem>`;
  const { idMap, errors } = await parseOLX(xml, [toMemoryRef('test.xml')], undefined, TEST_NS);

  expect(errors).toEqual([]);
  expect(getOlxJson(idMap, 'q')?.attributes.submitLabel).toBe('Verify');
});
