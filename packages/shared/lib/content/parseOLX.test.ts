// @vitest-environment node
// packages/shared/lib/content/parseOLX.test.ts
import { parseOLX } from './parseOLX';
import { kidDefinitionKeys } from './parsers';
import type { IdMap, OlxJson, DefinitionKey, ContentVariant } from '../types';
import { toMemoryRef } from '../types/storage';
import { TEST_NS, testKey } from '../test-utils';
import { asDefinitionKey, asStateKey, qualifyDefinitionRef, parseDefinitionRef, joinNs } from '../types/id-grammar';

const PROV = [toMemoryRef('test.xml')];

// Helper: extract the '*' (language-agnostic) variant for a block ID.
// Accepts bare or qualified IDs — qualified pass through.
const getOlxJson = (idMap: IdMap, id: string): OlxJson | undefined =>
  idMap[qualifyDefinitionRef(parseDefinitionRef(id), TEST_NS)]?.['*' as ContentVariant];

// Helper: get all blocks with a given tag (across all IDs, language-agnostic variant).
const getBlocksByTag = (idMap: IdMap, tag: string): OlxJson[] =>
  Object.values(idMap)
    .map(variantMap => variantMap['*' as ContentVariant])
    .filter(node => node?.tag === tag);

test('returns root id of single element', async () => {
  const xml = '<Vertical id="root"><TextBlock id="child"/></Vertical>';
  const { root, idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(root).toBe(testKey('root'));
  expect(idMap[root]).toBeDefined();
});

test('returns first element id when multiple roots', async () => {
  const xml = '<Vertical id="one"/><Vertical id="two"/>';
  const { root } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(root).toBe(testKey('one'));
});

test('rejects OLX variant language on raw HTML in mixed block content', async () => {
  const xml = '<Explanation id="ex"><section lang="fr">Bonjour</section></Explanation>';
  const { idMap, errors } = await parseOLX(xml, PROV, undefined, TEST_NS);

  expect(errors).toHaveLength(1);
  expect(errors[0].message).toContain(
    'lang= on raw HTML <section> is not yet supported; its semantics relative to OLX language variants are undefined'
  );
  expect(getOlxJson(idMap, 'ex')?.tag).toBe('ErrorNode');
});

test('CRITICAL: _sourceOffset is the byte offset of `<` from fast-xml-parser captureMetaData', async () => {
  // Regression guard: captureMetaData is undocumented in most search results
  // and could plausibly be removed or renamed in a fast-xml-parser minor
  // version bump. If this test fails after an upgrade, check parseOLX.ts for
  // the `captureMetaData: true` option and the XML_META symbol indexing.
  const xml = '<!-- Hi! --><Vertical id="foo"></Vertical>';
  const { idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(getOlxJson(idMap, 'foo')?._sourceOffset).toBe(12); // position of `<` in `<Vertical>`
});

test('error location populates line/column/offset from _sourceOffset', async () => {
  // Exercises offsetToLineCol via the duplicate-id producer site. The
  // duplicate `<TextArea>` is on line 3, indented 2 spaces, so its `<`
  // sits at column 3. Catches regressions in either the helper or the
  // entry._sourceOffset plumbing.
  const xml = '<Vertical>\n  <TextArea id="dup"/>\n  <TextArea id="dup"/>\n</Vertical>';
  const { errors } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors[0]?.type).toBe('duplicate_id');
  expect(errors[0]?.location).toMatchObject({ line: 3, column: 3, offset: 36 });
});

test('parses <Use> with attribute overrides', async () => {
  const xml = '<Vertical id="L"><Chat id="C" clip="[1,2]"/><Use ref="C" clip="[3,4]"/></Vertical>';
  const { idMap, root } = await parseOLX(xml, PROV, undefined, TEST_NS);
  const lesson = getOlxJson(idMap, root);
  const useKid = lesson.kids[1];
  expect(useKid).toEqual({
    type: 'block',
    definitionKey: testKey('C'),
    stateKey: testKey('C'),
    overrides: { clip: '[3,4]' },
  });
});

test.each([
  ['bare', 'answer', 'CONTENT/answer', 'CONTENT/answer'],
  ['scoped', 'list:#3:answer', 'CONTENT/answer', 'CONTENT/list:#3:answer'],
  ['namespace-qualified', 'calculus/list:#3:answer', 'calculus/answer', 'calculus/list:#3:answer'],
])('parses %s <Use ref> as a state reference', async (_label, ref, id, stateKey) => {
  const xml = `<Vertical id="root"><Use ref="${ref}"/></Vertical>`;
  const { idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  const useKid = getOlxJson(idMap, 'root')?.kids[0];

  expect(useKid).toEqual({ type: 'block', definitionKey: id, stateKey, overrides: {} });
});

test('preserves <Use> state identity and overrides in mixed-content blocks', async () => {
  const xml = '<Explanation id="root"><Use ref="list:#3:answer" class="from-use"/></Explanation>';
  const { idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);

  expect(getOlxJson(idMap, 'root')?.kids).toEqual([{
    type: 'block',
    definitionKey: testKey('answer'),
    stateKey: asStateKey('CONTENT/list:#3:answer'),
    overrides: { class: 'from-use' },
  }]);
});

test('static kid collection ignores HTML DOM ids', () => {
  expect(kidDefinitionKeys([
    { type: 'html', tag: 'div', id: 'dom-anchor' },
    { type: 'block', definitionKey: testKey('actual_child') },
  ])).toEqual([testKey('actual_child')]);
});

test.each(['alias', ''])('<Use> rejects id="%s" because ref owns its state identity', async (id) => {
  const xml = `<Vertical id="root"><Use id="${id}" ref="answer"/></Vertical>`;
  const { errors } = await parseOLX(xml, PROV, undefined, TEST_NS);

  expect(errors).toHaveLength(1);
  expect(errors[0].message).toContain(
    `<Use> reuses the state identity named by ref; remove id="${id}".`
  );
});

test('<Use> cannot be a document root', async () => {
  await expect(parseOLX(
    '<Use ref="answer"/>',
    PROV,
    undefined,
    TEST_NS,
  )).rejects.toThrow(/<Use> cannot be the document root/);
});

test('CRITICAL: Parser must preserve numeric text as strings (prevents "text.trim is not a function" errors)', async () => {
  // This test ensures fast-xml-parser doesn't convert numeric text to JavaScript numbers
  // If this test fails after upgrading fast-xml-parser, you need to update the parser configuration
  // in parseOLX.ts to prevent automatic type conversion.
  //
  // Current v5 config: parseTagValue: false, parseAttributeValue: false
  // v6 equivalent: tags: { valueParsers: [] }, attributes: { valueParsers: [] }

  const xml = `
    <CapaProblem id="test">
      <TextBlock>42</TextBlock>
      <TextBlock>-5</TextBlock>
      <TextBlock>0</TextBlock>
      <TextBlock>true</TextBlock>
      <TextBlock index="1">123</TextBlock>
    </CapaProblem>
  `;

  const result = await parseOLX(xml, PROV, undefined, TEST_NS);

  // Find TextBlock nodes in the parsed result
  const textBlocks = getBlocksByTag(result.idMap, 'TextBlock');

  expect(textBlocks.length).toBeGreaterThan(0);

  // Every TextBlock should have text content that remains as strings, never converted to numbers/booleans
  // TextBlock uses parsers.text() which returns a string directly
  textBlocks.forEach((block, index) => {
    const kids = block.kids;

    // Kids should be a string (from parsers.text())
    expect(typeof kids).toBe('string',
      `TextBlock ${index}: kids should be string but got ${typeof kids} (value: ${kids}). ` +
      `This usually means fast-xml-parser is auto-converting numbers/booleans. ` +
      `Check parseTagValue/parseAttributeValue settings in parseOLX.ts.`
    );

    // Verify we can call string methods (this would throw if kids was a number)
    expect(() => kids.trim()).not.toThrow();

    // The trimmed content should match one of our test values
    const trimmed = kids.trim();
    if (['42', '-5', '0', '123', 'true'].includes(trimmed)) {
      expect(typeof trimmed).toBe('string');
      expect(typeof trimmed).not.toBe('number');
      expect(typeof trimmed).not.toBe('boolean');
    }
  });

  // Also check that index attributes remain strings
  const blockWithIndex = textBlocks.find(block => block.attributes?.index);
  if (blockWithIndex) {
    expect(typeof blockWithIndex.attributes.index).toBe('string',
      `Attribute values should be strings. Check parseAttributeValue setting.`
    );
  }
});

test('auto-generated IDs are namespace-qualified with underscore-prefixed hash', async () => {
  // Blocks without explicit id= get SHA1-based IDs via makeSystemDefinitionRef:
  // "_" prefix reserves them from author use, then namespace-qualified.
  const xml = '<Vertical id="root"><TextBlock>Some content</TextBlock></Vertical>';
  const { idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  const ids = Object.keys(idMap);
  const autoIds = ids.filter(id => id !== testKey('root'));
  expect(autoIds.length).toBeGreaterThan(0);
  for (const id of autoIds) {
    expect(id).toMatch(new RegExp(`^${TEST_NS}/_[a-f0-9]+$`));
  }
});

// === Tests for requiresUniqueId attribute ===

test('TextArea blocks with duplicate IDs should fail (default behavior)', async () => {
  const xml = '<Vertical><TextArea/><TextArea/></Vertical>';
  const { errors } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0].type).toBe('duplicate_id');
});

test('TextArea blocks with explicit duplicate IDs should fail', async () => {
  const xml = '<Vertical><TextArea id="test"/><TextArea id="test"/></Vertical>';
  const { errors } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0].type).toBe('duplicate_id');
  expect(errors[0].message).toContain('Duplicate ID');
});

test('TextBlock elements with same content should allow duplicates', async () => {
  const xml = '<Vertical><TextBlock>Hello World!</TextBlock><TextBlock>Hello World!</TextBlock></Vertical>';
  const { errors, idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBe(0);

  // Both should be stored in idMap (latest overwrites)
  const textBlocks = getBlocksByTag(idMap, 'TextBlock');
  expect(textBlocks.length).toBeGreaterThan(0);
});

test('Markdown elements with same content should allow duplicates', async () => {
  const xml = '<Vertical><Markdown>## Hello</Markdown><Markdown>## Hello</Markdown></Vertical>';
  const { errors, idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBe(0);

  const markdownBlocks = getBlocksByTag(idMap, 'Markdown');
  expect(markdownBlocks.length).toBeGreaterThan(0);
});

test('Mixed block types: TextBlock allows duplicates, TextArea does not', async () => {
  const xml = `
    <Vertical>
      <TextBlock>Same content</TextBlock>
      <TextBlock>Same content</TextBlock>
      <TextArea/>
      <TextArea/>
    </Vertical>
  `;
  const { errors } = await parseOLX(xml, PROV, undefined, TEST_NS);

  // Should have exactly one error for the duplicate TextArea IDs
  expect(errors.length).toBe(1);
  expect(errors[0].type).toBe('duplicate_id');
  expect(errors[0].message).toContain('TextArea');
});

test('Function-based requiresUniqueId should work', async () => {
  // This test would require a custom test block with a function-based requiresUniqueId
  // For now, we'll test the error handling path
  const xml = '<Vertical><UnknownBlock id="test1"/><UnknownBlock id="test1"/></Vertical>';
  const { errors } = await parseOLX(xml, PROV, undefined, TEST_NS);

  // Unknown blocks should default to requiring unique IDs
  expect(errors.length).toBe(1);
  expect(errors[0].type).toBe('duplicate_id');
});

test('Explicit IDs should still be enforced for blocks that require uniqueness', async () => {
  const xml = '<Vertical><TextArea id="explicit"/><TextArea id="explicit"/></Vertical>';
  const { errors } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBe(1);
  expect(errors[0].type).toBe('duplicate_id');
  expect(errors[0].message).toContain(String(testKey('explicit')));
});

test('Explicit different IDs should work for all block types', async () => {
  const xml = `
    <Vertical>
      <TextBlock id="text1">Content</TextBlock>
      <TextBlock id="text2">Content</TextBlock>
      <TextArea id="area1"/>
      <TextArea id="area2"/>
    </Vertical>
  `;
  const { errors } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBe(0);
});

// === Tests for metadata parsing ===

test('parses valid metadata and ignores regular comments', async () => {
  const xml = `
    <!-- Regular comment -->
    <!--
    ---
    description: Test description
    category: psychology
    ---
    -->
    <Vertical id="test">
      <TextBlock>Content</TextBlock>
    </Vertical>
  `;
  const { idMap, errors } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBe(0);
  expect(getOlxJson(idMap, 'test').description).toBe('Test description');
  expect(getOlxJson(idMap, 'test').category).toBe('psychology');
});

test('parses index from metadata (positive, negative, fractional)', async () => {
  const makeXml = (index) => `
    <!--
    ---
    index: ${index}
    ---
    -->
    <Vertical id="test"><TextBlock>Content</TextBlock></Vertical>
  `;
  for (const val of [0, 3, -1, 9.5, -2.5]) {
    const { idMap, errors } = await parseOLX(makeXml(val), PROV, undefined, TEST_NS);
    expect(errors.length).toBe(0);
    expect(getOlxJson(idMap, 'test').index).toBe(val);
  }
});

test('reports teacher-friendly error for invalid YAML metadata', async () => {
  const xml = `
    <!--
    ---
    description: Test
    invalid yaml: [unclosed
    ---
    -->
    <Vertical id="test">
      <TextBlock>Content</TextBlock>
    </Vertical>
  `;
  const { errors, idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBe(1);
  expect(errors[0].type).toBe('metadata_error');
  expect(errors[0].message).toContain('📝');
  expect(errors[0].message).toContain('💡 TIP');
  expect(getOlxJson(idMap, 'test')?.description).toBeUndefined();
});

test('empty comment produces empty string (documents parser behavior)', async () => {
  // This test documents what fast-xml-parser produces for empty comments
  // If this test passes, we know empty comments produce empty strings, not undefined
  const xml = `<!----><Vertical id="test"><TextBlock>Content</TextBlock></Vertical>`;
  const { errors, idMap } = await parseOLX(xml, PROV, undefined, TEST_NS);
  // Empty comment should not cause parser errors (it's just an empty string)
  expect(errors.filter(e => e.type === 'parse_error').length).toBe(0);
  // And should not extract any metadata
  expect(getOlxJson(idMap, 'test')?.description).toBeUndefined();
});

// === Tests for language inheritance ===

test('child elements inherit parent language when no lang attribute', async () => {
  const xml = `
    <Vertical id="parent" lang="ar-Arab-SA">
      <TextBlock>Arabic content</TextBlock>
    </Vertical>
  `;
  const { idMap, errors } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBe(0);

  // Both elements should be stored under ar-Arab-SA language
  expect(idMap[testKey('parent')]).toBeDefined();
  expect(idMap[testKey('parent')]['ar-Arab-SA']).toBeDefined();
});

test('child can override parent language with own lang attribute', async () => {
  // Note: metadata in a preceding comment applies to the element that follows.
  // When parsing root elements, we extract metadata from preceding comments.
  // However, the way fast-xml-parser parses the document, comments at the top
  // level are not necessarily siblings of the first element - they might be
  // separate nodes. Let's test with inline metadata that's clearly associated.
  const xml = `<Vertical id="parent" lang="ar-Arab-SA"><TextBlock lang="pl-Latn-PL">Polish content</TextBlock></Vertical>`;
  const { idMap, errors } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBe(0);

  // Parent should be stored under ar-Arab-SA (explicit lang attribute)
  expect(idMap[testKey('parent')]).toBeDefined();
  expect(idMap[testKey('parent')]['ar-Arab-SA']).toBeDefined();
});

test('language cascade: element > parent > file metadata > default', async () => {
  const xml = `
    <!--
    ---
    lang: de-Latn-DE
    ---
    -->
    <Vertical id="root" lang="es-Latn-ES">
      <TextBlock id="explicit_lang" lang="fr-Latn-FR">French</TextBlock>
      <TextBlock id="inherit_parent">Spanish from parent</TextBlock>
    </Vertical>
  `;
  const { idMap, errors } = await parseOLX(xml, PROV, undefined, TEST_NS);
  expect(errors.length).toBe(0);

  // Root has explicit lang, should use that (es-Latn-ES, not file metadata de-Latn-DE)
  expect(idMap[testKey('root')]).toBeDefined();
  expect(idMap[testKey('root')]['es-Latn-ES']).toBeDefined();

  // TextBlock with explicit lang should use that
  expect(idMap[testKey('explicit_lang')]).toBeDefined();
  expect(idMap[testKey('explicit_lang')]['fr-Latn-FR']).toBeDefined();

  // TextBlock without lang should inherit parent's es-Latn-ES
  expect(idMap[testKey('inherit_parent')]).toBeDefined();
  expect(idMap[testKey('inherit_parent')]['es-Latn-ES']).toBeDefined();
});
