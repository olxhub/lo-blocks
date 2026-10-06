// The expansion build step: it must change NOTHING it was not asked to change.
//
// SELF-CONTAINED BY CONSTRUCTION. The fixture is written here rather than read
// from a course, because a build step that only demonstrates itself against one
// repository's content is not a build step, it is that repository's script.
import { describe, it, expect } from 'vitest';
import { expandFile, serialise, mightHoldATemplate } from './materialiseRubrics';

/** A rubric shaped like a real one: a frame, a shared vocabulary, two items. */
const PLAIN = `<Rubric id="r" title="A rubric">
  <Verdicts name="met_absent" values="met|absent"/>
  <Frame name="judging">
    <Segment>Answer on what the response says.</Segment>
    <Segment ifDeclared="timed"> Within one {unit}.</Segment>
  </Frame>
  <Item scores="q_one" max="2">
    <Slot key="a" label="First check" pts="1" verdicts="@met_absent">the thing itself</Slot>
    <Guidance>Read it literally.</Guidance>
  </Item>
  <Item scores="q_two" max="1">
    <Slot key="b" label="Second check" pts="1" verdicts="@met_absent">something else</Slot>
  </Item>
</Rubric>
`;

const TEMPLATED = PLAIN.replace('  <Item scores="q_one"',
  `  <ItemTemplate name="demo">
    <Slot key="k" label="A check" pts="1" verdicts="met|absent">judge {thing}</Slot>
    <Guidance ifDeclared="extra">Only when the item declares it.</Guidance>
  </ItemTemplate>
  <Item scores="q_new" max="1" use="@demo" params="thing=the answer"/>
  <Item scores="q_one"`);

describe('materialiseRubrics', () => {
  it('leaves a rubric with no template completely alone', () => {
    expect(mightHoldATemplate(PLAIN)).toBe(false);
    expect(expandFile(PLAIN, 'plain.olx')).toBeNull();
  });

  // THE SPAN MACHINERY IS ONLY EXERCISED WHEN SOMETHING CHANGES: the test above
  // returns on the fast path and never reaches it. This one puts a template in
  // and checks the elements around it come back as their own bytes.
  it('expands the templated item and emits every other element from source', () => {
    const out = expandFile(TEMPLATED, 'templated.olx');
    expect(out).not.toBeNull();
    const text = out as string;

    expect(text).not.toContain('<ItemTemplate');      // dropped: it was the source
    expect(text).not.toContain('use="@demo"');        // the item is literal now
    expect(text).toContain('judge the answer');       // the parameter was filled
    // `ifDeclared` is consumed by expansion, and this item declares no `extra`
    expect(text).not.toContain('ifDeclared="extra"');
    expect(text).not.toContain('Only when the item declares it.');

    // EVERY UNTOUCHED ELEMENT IS BYTE-IDENTICAL, spans and all -- including the
    // `ifDeclared` on a FRAME segment, which is a different mechanism and must
    // survive a pass that consumes the template marker of the same name.
    for (const span of [
      '  <Verdicts name="met_absent" values="met|absent"/>\n',
      '    <Segment ifDeclared="timed"> Within one {unit}.</Segment>\n',
      '  <Item scores="q_one" max="2">\n',
      '    <Slot key="b" label="Second check" pts="1" verdicts="@met_absent">something else</Slot>\n',
    ]) {
      expect(text).toContain(span);
    }
    expect((text.match(/<Item /g) ?? []).length).toBe(3);
  });

  it('refuses an item whose template the rubric does not declare', () => {
    const bad = PLAIN.replace('<Item scores="q_one" max="2">',
                              '<Item scores="q_one" max="2" use="@absent">')
                     .replace('<Rubric ', '<Rubric ');
    // the fast path skips files with no <ItemTemplate, so give it one to open
    const withTpl = bad.replace('  <Verdicts',
      '  <ItemTemplate name="other"><Slot key="k" pts="1">x</Slot></ItemTemplate>\n  <Verdicts');
    expect(() => expandFile(withTpl, 'bad.olx')).toThrow(/does not declare/);
  });

  it('serialises an attribute newline as &#10;, not a literal', () => {
    const s = serialise({ kind: 'Slot', attrs: { rule: 'line one\nline two' } }, '  ');
    expect(s).toBe('  <Slot rule="line one&#10;line two"/>');
  });
});
