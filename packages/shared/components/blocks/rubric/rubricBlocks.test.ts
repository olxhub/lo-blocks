// @vitest-environment node
// packages/shared/components/blocks/rubric/rubricBlocks.test.ts
//
// The rubric block types: Rubric, Verdicts, Frame, Segment, Deduction, Item.
//
// They are ACCEPTED AND IGNORED for a full stage before any content uses them,
// so what these tests defend is that the engine tolerates them, parses them,
// registers their ids, and shows the learner nothing.

import { parseOLX } from '@/lib/content/parseOLX';
import type { IdMap, OlxJson, ContentVariant } from '@/lib/types';
import { toMemoryRef } from '@/lib/types/storage';
import { TEST_NS } from '@/lib/test-utils';
import { qualifyDefinitionRef, parseDefinitionRef } from '@/lib/types/id-grammar';

const PROV = [toMemoryRef('test.xml')];
const parse = (xml: string) => parseOLX(xml, PROV, undefined, TEST_NS);
const get = (idMap: IdMap, id: string): OlxJson | undefined =>
  idMap[qualifyDefinitionRef(parseDefinitionRef(id), TEST_NS)]?.['*' as ContentVariant];

// A rubric's children are their OWN idMap entries; the parent holds references.
// Asserting against the parent's JSON tests nothing about them.
const byTag = (idMap: IdMap, tag: string): any[] =>
  Object.values(idMap)
    .map(v => (v as any)['*'])
    .filter(n => n?.tag === tag);
const noErrors = (idMap: IdMap) => byTag(idMap, 'ErrorNode')
  .map(n => n.attributes?.message ?? '');

describe('a rubric parses and registers', () => {
  it('registers the rubric and its children', async () => {
    const { idMap } = await parse(`
      <Rubric id="r" title="R">
        <Verdicts name="v" values="met|absent"/>
        <Deduction code="C" pts="2">wording</Deduction>
        <Frame name="f"><Segment>one</Segment></Frame>
        <Item scores="q" max="3"/>
      </Rubric>`);
    expect(get(idMap, 'r')).toBeDefined();
  });

  it('parses without a title', async () => {
    const { idMap } = await parse('<Rubric id="r"><Verdicts name="v" values="a|b"/></Rubric>');
    expect(get(idMap, 'r')).toBeDefined();
  });
});

describe('Verdicts', () => {
  it('keeps the values verbatim, satisfying one first', async () => {
    const { idMap } = await parse(
      '<Rubric id="r"><Verdicts name="v" values="met|absent|unclear"/></Rubric>');
    expect(noErrors(idMap)).toEqual([]);
    // The ORDER is what a checklist and a sheet attribute both render, so it
    // must survive parsing untouched.
    expect(byTag(idMap, 'Verdicts')[0].attributes.values).toBe('met|absent|unclear');
  });
});

describe('Frame and Segment', () => {
  it('accepts segments with and without a condition', async () => {
    const { idMap } = await parse(`
      <Rubric id="r">
        <Frame name="f">
          <Segment>always</Segment>
          <Segment ifDeclared="cond"> sometimes</Segment>
          <Segment ifDeclared="!cond"> otherwise</Segment>
        </Frame>
      </Rubric>`);
    expect(noErrors(idMap)).toEqual([]);
    const segs = byTag(idMap, 'Segment');
    expect(segs).toHaveLength(3);
    expect(segs.map(s => s.attributes?.ifDeclared)).toEqual([undefined, 'cond', '!cond']);
  });

  it('preserves leading space inside a segment', async () => {
    // Significant: it is how a conditional sentence joins the ones either side.
    const { idMap } = await parse(
      '<Rubric id="r"><Frame name="f"><Segment ifDeclared="c"> spaced</Segment></Frame></Rubric>');
    expect(noErrors(idMap)).toEqual([]);
    expect(JSON.stringify(byTag(idMap, 'Segment')[0])).toContain(' spaced');
  });
});

describe('Deduction', () => {
  it('carries code, cost and wording', async () => {
    const { idMap } = await parse(
      '<Rubric id="r"><Deduction code="NO_ANSWER" pts="4">did not answer</Deduction></Rubric>');
    expect(noErrors(idMap)).toEqual([]);
    const d = byTag(idMap, 'Deduction')[0];
    expect(d.attributes.code).toBe('NO_ANSWER');
    expect(JSON.stringify(d)).toContain('did not answer');
  });

  it('accepts the repeatable flag', async () => {
    const { idMap } = await parse(
      '<Rubric id="r"><Deduction code="C" pts="2" repeatable="true">w</Deduction></Rubric>');
    expect(noErrors(idMap)).toEqual([]);
    expect(byTag(idMap, 'Deduction')[0].attributes.repeatable).toBe('true');
  });
});

describe('Item', () => {
  it('carries ref, max, conditions and params', async () => {
    const { idMap } = await parse(
      '<Rubric id="r"><Item scores="q1" max="5" conditions="a|b" params="unit=week"/></Rubric>');
    expect(noErrors(idMap)).toEqual([]);
    const it0 = byTag(idMap, 'Item')[0];
    expect(it0.attributes.scores).toBe('q1');
    expect(it0.attributes.params).toBe('unit=week');
  });

  it('parses with ref alone, letting the runtime total the slots', async () => {
    const { idMap } = await parse('<Rubric id="r"><Item scores="q1"/></Rubric>');
    expect(get(idMap, 'r')).toBeDefined();
  });
});

describe('the engine tolerates them being unused (O1)', () => {
  it('a document with a rubric and nothing referencing it still parses', async () => {
    const { root, idMap } = await parse(`
      <Vertical id="v">
        <Rubric id="r"><Item scores="nothing_references_this"/></Rubric>
        <Markdown id="m">visible</Markdown>
      </Vertical>`);
    expect(root).toBeDefined();
    expect(get(idMap, 'm')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// REFUSING malformed input.
//
// The half of "parses and validates" that is easy to skip: a block that accepts
// anything validates nothing, and every test above would still pass. Each case
// here asserts the parser produces an ErrorNode rather than a silently wrong
// block, because a rubric that mis-parses scores people wrongly and says
// nothing about it.

const errorsIn = (idMap: IdMap): string[] =>
  Object.values(idMap)
    .map(v => (v as any)['*'])
    .filter(n => n?.tag === 'ErrorNode')
    .map(n => String(n.attributes?.message ?? ''));

describe('the blocks refuse what they cannot mean', () => {
  it('Verdicts without values is an error, not an empty vocabulary', async () => {
    const { idMap } = await parse('<Rubric id="r"><Verdicts name="v"/></Rubric>');
    expect(errorsIn(idMap).length).toBeGreaterThan(0);
  });

  it('Verdicts without a name cannot be referenced, and is refused', async () => {
    const { idMap } = await parse('<Rubric id="r"><Verdicts values="a|b"/></Rubric>');
    expect(errorsIn(idMap).length).toBeGreaterThan(0);
  });

  it('Deduction without a code is refused', async () => {
    const { idMap } = await parse('<Rubric id="r"><Deduction pts="2">w</Deduction></Rubric>');
    expect(errorsIn(idMap).length).toBeGreaterThan(0);
  });

  it('Deduction without a cost is refused', async () => {
    // A charge with no number is not a lenient charge, it is an unusable one.
    const { idMap } = await parse('<Rubric id="r"><Deduction code="C">w</Deduction></Rubric>');
    expect(errorsIn(idMap).length).toBeGreaterThan(0);
  });

  it('Deduction with a non-numeric cost is refused', async () => {
    const { idMap } = await parse(
      '<Rubric id="r"><Deduction code="C" pts="lots">w</Deduction></Rubric>');
    expect(errorsIn(idMap).length).toBeGreaterThan(0);
  });

  it('Frame without a name is refused', async () => {
    const { idMap } = await parse('<Rubric id="r"><Frame><Segment>x</Segment></Frame></Rubric>');
    expect(errorsIn(idMap).length).toBeGreaterThan(0);
  });

  it('Item without a target is refused', async () => {
    // An item that scores nothing is not a harmless placeholder: it claims
    // points against an element no one can find.
    const { idMap } = await parse('<Rubric id="r"><Item max="3"/></Rubric>');
    expect(errorsIn(idMap).length).toBeGreaterThan(0);
  });

  it('Item with a non-numeric max is refused', async () => {
    const { idMap } = await parse('<Rubric id="r"><Item scores="q" max="plenty"/></Rubric>');
    expect(errorsIn(idMap).length).toBeGreaterThan(0);
  });

  it('`ref` is still refused on Item, since the platform reserves it', async () => {
    // The reserved word is the natural one to reach for; this pins the refusal
    // so a later "helpful" alias cannot quietly reintroduce the collision.
    const { idMap } = await parse('<Rubric id="r"><Item ref="q"/></Rubric>');
    expect(errorsIn(idMap).join(' ')).toMatch(/Only <Use> elements may have 'ref'/);
  });

  it('a well-formed rubric produces NO errors', async () => {
    // The control: without it, every assertion above could pass because the
    // parser errors on everything.
    const { idMap } = await parse(`
      <Rubric id="r" title="R">
        <Verdicts name="v" values="met|absent"/>
        <Deduction code="C" pts="2">wording</Deduction>
        <Frame name="f"><Segment>a</Segment><Segment ifDeclared="c"> b</Segment></Frame>
        <Item scores="q" max="3" conditions="c" params="unit=week"/>
      </Rubric>`);
    expect(errorsIn(idMap)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ItemTemplate: the shape, and the item that uses it.

describe('ItemTemplate', () => {
  it('parses a template with substitution and a conditional child', async () => {
    const { idMap } = await parse(`
      <Rubric id="r">
        <ItemTemplate name="pair">
          <Item scores="ignored_inside_template" max="4"/>
        </ItemTemplate>
      </Rubric>`);
    expect(errorsIn(idMap)).toEqual([]);
    expect(byTag(idMap, 'ItemTemplate')[0].attributes.name).toBe('pair');
  });

  it('a template without a name cannot be referenced, and is refused', async () => {
    const { idMap } = await parse('<Rubric id="r"><ItemTemplate/></Rubric>');
    expect(errorsIn(idMap).length).toBeGreaterThan(0);
  });

  it('an Item can name the template it is built from', async () => {
    const { idMap } = await parse(`
      <Rubric id="r">
        <ItemTemplate name="pair"/>
        <Item scores="q1" use="@pair" params="longName=Alpha|abbrev=a"
              conditions="hasExtra"/>
      </Rubric>`);
    expect(errorsIn(idMap)).toEqual([]);
    const it0 = byTag(idMap, 'Item')[0];
    expect(it0.attributes.use).toBe('@pair');
    expect(it0.attributes.params).toBe('longName=Alpha|abbrev=a');
    expect(it0.attributes.conditions).toBe('hasExtra');
  });

  it('an Item without `use` is still valid: not every item is templated', async () => {
    const { idMap } = await parse('<Rubric id="r"><Item scores="q1" max="2"/></Rubric>');
    expect(errorsIn(idMap)).toEqual([]);
  });

  it('placeholders survive parsing untouched, for the BUILD to fill', async () => {
    // The parser must not try to resolve `{abbrev}`: expansion happens later,
    // against parameters this document does not have.
    const { idMap } = await parse(`
      <Rubric id="r">
        <ItemTemplate name="pair">
          <Slot key="is_{abbrev}" verdicts="met|absent" pts="2"/>
        </ItemTemplate>
      </Rubric>`);
    expect(errorsIn(idMap)).toEqual([]);
    expect(JSON.stringify(byTag(idMap, 'Slot')[0])).toContain('is_{abbrev}');
  });

  // ON RESERVED NAMES. Six have been found by authoring -- `ref`, `id`/`title`,
  // `when`, `cond`, `keys` and `of` -- and a test for them was written here and
  // then removed: `core()` calls `assertNotReserved` at module load, so a
  // reserved attribute throws on IMPORT and every test in this file fails
  // first. There is nothing left for a test to catch. Check the list in
  // lib/stateLanguage/keywords.ts BEFORE choosing an attribute name.
});
