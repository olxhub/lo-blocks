// packages/shared/components/blocks/CapaProblem/CapaProblem.test.ts
//
// Unit tests for CapaProblem parser behavior.
// Render tests are covered by demo-render.test.js which tests all .olx files.
//
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { parseOLX } from '@/lib/content/parseOLX';
import { FileStorageProvider } from '@/lib/storage/lofs/providers/file';
import { toMemoryRef } from '@/lib/types/storage';
import { getOlxJson, TEST_NS, testKey } from '@/lib/test-utils';
import { asDefinitionKey } from '@/lib/types/id-grammar';
import { ensureCalcLoaded } from '@/lib/grading';
import { beforeAll } from 'vitest';

// CapaProblem fixtures contain NumericalGrader, whose parse triggers the
// lazy math-engine load (ensureReady). Preload it so the first test's 5s
// budget isn't spent importing mathjs under full-suite CPU load.
beforeAll(async () => {
  await ensureCalcLoaded();
});

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

  // Auto-wired targets go through the ordinary grader schema, so they have
  // the same validated StateRef[] shape as authored targets.
  expect(grader.attributes.target).toEqual(['CapaProblemDemo_input_0']);
});

it('preserves an authored target when a grader also contains an input', async () => {
  const xml = `<CapaProblem id="q">
    <NumericalGrader id="grader" answer="1" target="authored_input">
      <NumberInput id="nested_input" />
    </NumericalGrader>
  </CapaProblem>`;
  const { idMap, errors } = await parseOLX(xml, [toMemoryRef('test.xml')], undefined, TEST_NS);

  expect(errors).toEqual([]);
  expect(getOlxJson(idMap, 'grader')?.attributes.target).toEqual(['authored_input']);
  expect(getOlxJson(idMap, 'nested_input')?.tag).toBe('NumberInput');
});

it('validates an authored target instead of replacing it', async () => {
  const xml = `<CapaProblem id="q">
    <NumericalGrader id="grader" answer="1" target="not a ref">
      <NumberInput id="nested_input" />
    </NumericalGrader>
  </CapaProblem>`;
  const { idMap, errors } = await parseOLX(xml, [toMemoryRef('test.xml')], undefined, TEST_NS);

  expect(errors).toHaveLength(1);
  expect(errors[0].message).toContain('target: Invalid input');
  expect(getOlxJson(idMap, 'grader')?.tag).toBe('ErrorNode');
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

it('runs text parsers for blocks nested through HTML', async () => {
  const xml = `<CapaProblem id="q">
    Before
    <Markdown id="direct_md">Direct **Markdown**</Markdown>
    <section class="prompt">
      Lead
      <Markdown id="nested_md">Nested **Markdown**</Markdown>
      <em>Tail</em>
      <div><strong><Markdown id="deep_md">Deep **Markdown**</Markdown></strong></div>
      <Explanation id="explanation" showWhen="always">
        <Markdown id="owned_md">Parser-owned **Markdown**</Markdown>
        <TextArea id="owned_input">Initial answer</TextArea>
      </Explanation>
    </section>
    After
  </CapaProblem>`;
  const { idMap, errors } = await parseOLX(xml, [toMemoryRef('test.xml')], undefined, TEST_NS);

  expect(errors).toEqual([]);
  expect(getOlxJson(idMap, 'direct_md')?.kids).toBe('Direct **Markdown**');
  expect(getOlxJson(idMap, 'nested_md')?.kids).toBe('Nested **Markdown**');
  expect(getOlxJson(idMap, 'deep_md')?.kids).toBe('Deep **Markdown**');
  expect(getOlxJson(idMap, 'owned_md')?.kids).toBe('Parser-owned **Markdown**');
  expect(getOlxJson(idMap, 'owned_input')?.kids).toBe('Initial answer');

  // CapaProblem still owns the mixed-content structure used for rendering.
  const problem = getOlxJson(idMap, 'q');
  expect(problem?.kids).toEqual([
    { type: 'text', text: expect.stringContaining('Before') },
    { type: 'block', definitionKey: testKey('direct_md') },
    {
      type: 'html',
      tag: 'section',
      attributes: { class: 'prompt' },
      kids: [
        { type: 'text', text: expect.stringContaining('Lead') },
        { type: 'block', definitionKey: testKey('nested_md') },
        {
          type: 'html',
          tag: 'em',
          attributes: {},
          kids: [{ type: 'text', text: 'Tail' }],
        },
        {
          type: 'html',
          tag: 'div',
          attributes: {},
          kids: [{
            type: 'html',
            tag: 'strong',
            attributes: {},
            kids: [{ type: 'block', definitionKey: testKey('deep_md') }],
          }],
        },
        { type: 'block', definitionKey: testKey('explanation') },
      ],
    },
    { type: 'text', text: expect.stringContaining('After') },
  ]);
});

it('auto-wires a localized grader in the grader language variant', async () => {
  const xml = `<CapaProblem id="q" lang="en" grade="immediate">
    <section>
      <!--
      ---
      lang: fr
      description: Grader metadata reaches the child parser
      ---
      -->
      <NumericalGrader id="localized_grader" answer="8">
        <NumberInput id="localized_input" />
      </NumericalGrader>
    </section>
  </CapaProblem>`;
  const { idMap, errors } = await parseOLX(xml, [toMemoryRef('test.xml')], undefined, TEST_NS);

  expect(errors).toEqual([]);
  const grader = idMap[testKey('localized_grader')]?.fr;
  expect(grader).toMatchObject({
    lang: 'fr',
    description: 'Grader metadata reaches the child parser',
    attributes: {
      target: ['localized_input'],
      gradeMode: 'immediate',
    },
  });
  expect(idMap[testKey('localized_grader')]?.en).toBeUndefined();
  expect(idMap[testKey('localized_input')]?.fr).toBeDefined();
  expect(idMap[testKey('q')]?.en?.tag).toBe('CapaProblem');
});

it('keeps outer grading mode off a nested problem and its leaf graders', async () => {
  const xml = `<CapaProblem id="outer" grade="immediate">
    <NumericalGrader id="outer_grader" answer="1">
      <NumberInput id="outer_input" />
    </NumericalGrader>
    <CapaProblem id="inner" grade="submit">
      <NumberInput id="inner_sibling_input" />
      <NumericalGrader id="inner_grader" answer="2">
        <NumberInput id="inner_input" />
      </NumericalGrader>
    </CapaProblem>
  </CapaProblem>`;
  const { idMap, errors } = await parseOLX(xml, [toMemoryRef('test.xml')], undefined, TEST_NS);

  expect(errors).toEqual([]);
  expect(getOlxJson(idMap, 'outer_grader')?.attributes).toMatchObject({
    gradeMode: 'immediate',
    target: ['outer_input'],
  });
  // The inner problem is a metagrader boundary, not an execution leaf. Its
  // own authored grade= governs its children without a last-write-wins stamp.
  expect(getOlxJson(idMap, 'inner')?.attributes.gradeMode).toBeUndefined();
  expect(getOlxJson(idMap, 'inner')?.attributes.target).toBeUndefined();
  expect(getOlxJson(idMap, 'inner_grader')?.attributes).toMatchObject({
    gradeMode: 'submit',
    target: ['inner_input'],
  });
});

it('stamps executable graders, but not nested metagraders', async () => {
  const xml = `<CapaProblem id="outer" grade="immediate">
    <RulesGrader id="rules">
      <StringGrader id="nested_grader" answer="yes"><LineInput /></StringGrader>
    </RulesGrader>
    <MarkupProblem id="markup"><![CDATA[
Question
===
>>Answer yes.<<
= yes
    ]]></MarkupProblem>
  </CapaProblem>`;
  const { idMap, errors } = await parseOLX(xml, [toMemoryRef('test.xml')], undefined, TEST_NS);

  expect(errors).toEqual([]);
  expect(getOlxJson(idMap, 'rules')?.attributes.gradeMode).toBe('immediate');
  expect(getOlxJson(idMap, 'nested_grader')?.attributes.gradeMode).toBeUndefined();
  expect(getOlxJson(idMap, 'markup')?.tag).toBe('MarkupProblem');
  expect(getOlxJson(idMap, 'markup')?.attributes.gradeMode).toBeUndefined();
});

it('rejects OLX variant language on raw HTML inside CapaProblem', async () => {
  const xml = `<CapaProblem id="q">
    <section lang="fr"><Markdown>Bonjour</Markdown></section>
  </CapaProblem>`;
  const { idMap, errors } = await parseOLX(xml, [toMemoryRef('test.xml')], undefined, TEST_NS);

  expect(errors).toHaveLength(1);
  expect(errors[0].message).toContain(
    'lang= on raw HTML <section> is not yet supported; its semantics relative to OLX language variants are undefined'
  );
  expect(getOlxJson(idMap, 'q')?.tag).toBe('ErrorNode');
});
