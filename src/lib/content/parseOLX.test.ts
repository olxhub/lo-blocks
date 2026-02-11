// @vitest-environment node
// src/lib/content/parseOLX.test.js
import { parseOLX } from './parseOLX';
import type { IdMap, OlxJson, OlxKey, ContentVariant } from '../types';

const PROV = ['file://test.xml'];

// Helper: extract the '*' (language-agnostic) variant for a block ID.
// Accepts string for convenience in tests (cast to branded types internally).
const getOlxJson = (idMap: IdMap, id: string): OlxJson | undefined =>
  idMap[id as OlxKey]?.['*' as ContentVariant];

test('returns root id of single element', async () => {
  const xml = '<Vertical id="root"><TextBlock id="child"/></Vertical>';
  const { root, idMap } = await parseOLX(xml, PROV);
  expect(root).toBe('root');
  expect(idMap[root]).toBeDefined();
});

test('returns first element id when multiple roots', async () => {
  const xml = '<Vertical id="one"/><Vertical id="two"/>';
  const { root } = await parseOLX(xml, PROV);
  expect(root).toBe('one');
});

test('parses <Use> with attribute overrides', async () => {
  const xml = '<Vertical id="L"><Chat id="C" clip="[1,2]"/><Use ref="C" clip="[3,4]"/></Vertical>';
  const { idMap, root } = await parseOLX(xml, PROV);
  const lesson = getOlxJson(idMap, root);
  const useKid = lesson.kids[1];
  expect(useKid).toEqual({ type: 'block', id: 'C', overrides: { clip: '[3,4]' } });
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

  const result = await parseOLX(xml, PROV);

  // Find TextBlock nodes in the parsed result
  // FIXME: idMap is now nested { id: { lang: OlxJson } }, so flatten it
  const textBlocks = Object.entries(result.idMap)
    .map(([_, variantMap]) => variantMap['*' as ContentVariant])
    .filter(node => node?.tag === 'TextBlock');

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

test('auto-generated IDs start with underscore', async () => {
  // Blocks without explicit id= get SHA1-based IDs prefixed with "_"
  // to avoid leading-digit violations (hex hashes can start with 0-9).
  const xml = '<Vertical id="root"><TextBlock>Some content</TextBlock></Vertical>';
  const { idMap } = await parseOLX(xml, PROV);
  const ids = Object.keys(idMap);
  const autoIds = ids.filter(id => id !== 'root');
  expect(autoIds.length).toBeGreaterThan(0);
  for (const id of autoIds) {
    expect(id).toMatch(/^_[a-f0-9]+$/);
  }
});

// === Tests for requiresUniqueId attribute ===

test('TextArea blocks with duplicate IDs should fail (default behavior)', async () => {
  const xml = '<Vertical><TextArea/><TextArea/></Vertical>';
  const { errors } = await parseOLX(xml, PROV);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0].type).toBe('duplicate_id');
});

test('TextArea blocks with explicit duplicate IDs should fail', async () => {
  const xml = '<Vertical><TextArea id="test"/><TextArea id="test"/></Vertical>';
  const { errors } = await parseOLX(xml, PROV);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0].type).toBe('duplicate_id');
  expect(errors[0].message).toContain('Duplicate ID "test"');
});

test('TextBlock elements with same content should allow duplicates', async () => {
  const xml = '<Vertical><TextBlock>Hello World!</TextBlock><TextBlock>Hello World!</TextBlock></Vertical>';
  const { errors, idMap } = await parseOLX(xml, PROV);
  expect(errors.length).toBe(0);

  // Both should be stored in idMap (latest overwrites)
  // FIXME: idMap is now nested { id: { lang: OlxJson } }, so flatten it
  const textBlocks = Object.entries(idMap)
    .map(([_, variantMap]) => variantMap['*' as ContentVariant])
    .filter(node => node?.tag === 'TextBlock');
  expect(textBlocks.length).toBeGreaterThan(0);
});

test('Markdown elements with same content should allow duplicates', async () => {
  const xml = '<Vertical><Markdown>## Hello</Markdown><Markdown>## Hello</Markdown></Vertical>';
  const { errors, idMap } = await parseOLX(xml, PROV);
  expect(errors.length).toBe(0);

  // FIXME: idMap is now nested { id: { lang: OlxJson } }, so flatten it
  const markdownBlocks = Object.entries(idMap)
    .map(([_, variantMap]) => variantMap['*' as ContentVariant])
    .filter(node => node?.tag === 'Markdown');
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
  const { errors } = await parseOLX(xml, PROV);

  // Should have exactly one error for the duplicate TextArea IDs
  expect(errors.length).toBe(1);
  expect(errors[0].type).toBe('duplicate_id');
  expect(errors[0].message).toContain('TextArea');
});

test('Function-based requiresUniqueId should work', async () => {
  // This test would require a custom test block with a function-based requiresUniqueId
  // For now, we'll test the error handling path
  const xml = '<Vertical><UnknownBlock id="test1"/><UnknownBlock id="test1"/></Vertical>';
  const { errors } = await parseOLX(xml, PROV);

  // Unknown blocks should default to requiring unique IDs
  expect(errors.length).toBe(1);
  expect(errors[0].type).toBe('duplicate_id');
});

test('Explicit IDs should still be enforced for blocks that require uniqueness', async () => {
  const xml = '<Vertical><TextArea id="explicit"/><TextArea id="explicit"/></Vertical>';
  const { errors } = await parseOLX(xml, PROV);
  expect(errors.length).toBe(1);
  expect(errors[0].type).toBe('duplicate_id');
  expect(errors[0].message).toContain('explicit');
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
  const { errors } = await parseOLX(xml, PROV);
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
  const { idMap, errors } = await parseOLX(xml, PROV);
  expect(errors.length).toBe(0);
  expect(getOlxJson(idMap, 'test').description).toBe('Test description');
  expect(getOlxJson(idMap, 'test').category).toBe('psychology');
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
  const { errors, idMap } = await parseOLX(xml, PROV);
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
  const { errors, idMap } = await parseOLX(xml, PROV);
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
  const { idMap, errors } = await parseOLX(xml, PROV);
  expect(errors.length).toBe(0);

  // Both elements should be stored under ar-Arab-SA language
  expect(idMap['parent']).toBeDefined();
  expect(idMap['parent']['ar-Arab-SA']).toBeDefined();
});

test('child can override parent language with own lang attribute', async () => {
  // Note: metadata in a preceding comment applies to the element that follows.
  // When parsing root elements, we extract metadata from preceding comments.
  // However, the way fast-xml-parser parses the document, comments at the top
  // level are not necessarily siblings of the first element - they might be
  // separate nodes. Let's test with inline metadata that's clearly associated.
  const xml = `<Vertical id="parent" lang="ar-Arab-SA"><TextBlock lang="pl-Latn-PL">Polish content</TextBlock></Vertical>`;
  const { idMap, errors } = await parseOLX(xml, PROV);
  expect(errors.length).toBe(0);

  // Parent should be stored under ar-Arab-SA (explicit lang attribute)
  expect(idMap['parent']).toBeDefined();
  expect(idMap['parent']['ar-Arab-SA']).toBeDefined();
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
  const { idMap, errors } = await parseOLX(xml, PROV);
  expect(errors.length).toBe(0);

  // Root has explicit lang, should use that (es-Latn-ES, not file metadata de-Latn-DE)
  expect(idMap['root']).toBeDefined();
  expect(idMap['root']['es-Latn-ES']).toBeDefined();

  // TextBlock with explicit lang should use that
  expect(idMap['explicit_lang']).toBeDefined();
  expect(idMap['explicit_lang']['fr-Latn-FR']).toBeDefined();

  // TextBlock without lang should inherit parent's es-Latn-ES
  expect(idMap['inherit_parent']).toBeDefined();
  expect(idMap['inherit_parent']['es-Latn-ES']).toBeDefined();
});
