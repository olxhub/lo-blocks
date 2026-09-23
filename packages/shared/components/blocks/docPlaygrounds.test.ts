// Every `olx:playground` in these docs must PARSE, because a playground is
// rendered, not just displayed: `OLXCodeBlock` wraps it in a <Vertical> and runs
// it through the same parser. A snippet that does not parse is a worked example
// the reader cannot run, and nothing else in the suite looks at documentation.
//
// EVERY block doc, since 2026-09-13. Widening it first reported five failures,
// all pre-existing and all real -- those playgrounds did not render at all:
//   * a bare `&` in prose ("Roediger & Butler's study") is not valid XML
//     (Collapsible #3, NumberInput #3, Sortable #2), now `&amp;`
//   * `sidebar <- panel`, Chat's assignment syntax, is read by the XML parser as
//     the start of a tag named '-' (Chat #2, UseHistory #2), now wrapped in
//     CDATA so the script reaches the Chat parser verbatim
// A playground is RENDERED, not merely displayed, so a snippet that does not
// parse is a worked example the reader cannot run.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseOLX } from '@/lib/content/parseOLX';
import { parseDerived, parseSlots, scoreSlotSheet } from '@/lib/llm/slotSheet';
import { verdictFor } from '@/lib/llm/derivedVerdicts';
import { toMemoryRef } from '@/lib/types/storage';
import { TEST_NS } from '@/lib/test-utils';

import { globSync } from 'glob';
const DOCS = globSync('packages/shared/components/blocks/**/*.md',
                      { cwd: path.resolve(__dirname, '../../../..') }).sort();
const ROOT = path.resolve(__dirname, '../../../..');

function snippets(md: string): string[] {
  const out: string[] = [];
  const re = /```olx:playground\n([\s\S]*?)```/g;
  let m; while ((m = re.exec(md))) out.push(m[1]);
  return out;
}

// PARSING IS NOT ENOUGH, and this suite learned that the hard way. Every
// `derived=` in the grading docs was written `key:ref`, which `parseDerived`
// DROPS -- the grammar is `key:kind:refs` and an unknown kind is filtered out.
// The XML parsed perfectly, the playgrounds rendered, and every check would have
// scored unsatisfied whatever the student typed, because the rules silently
// vanished. So the docs' own claims are asserted here too.
describe('documentation examples behave as they claim', () => {
  it('every `derived=` in the docs survives parseDerived', () => {
    for (const rel of DOCS) {
      const md = readFileSync(path.join(ROOT, rel), 'utf8');
      for (const m of md.matchAll(/derived="([^"]*)"/g)) {
        const spec = m[1].replace(/\s+/g, '');
        const want = spec.split('|').filter(Boolean).length;
        expect(parseDerived(spec).length,
               `${path.basename(rel)}: derived="${spec}" loses rules`).toBe(want);
      }
    }
  });

  it('the documented presence example scores as the prose says', () => {
    // SlotSheetGrader.md: "leave a box empty and the item loses exactly that
    // check's point".
    const slots = parseSlots('w1:Week 1@1|w2:Week 2@1|w3:Week 3@1');
    const rules = parseDerived('w1:present:wk1|w2:present:wk2|w3:present:wk3');
    const fields: Record<string, string> = { wk1: '5', wk2: '', wk3: '7' };
    const checks: any = {};
    for (const rule of rules) {
      const texts = rule.targets.map((t: string) => fields[t] ?? '');
      checks[rule.key] = verdictFor(rule, texts);
    }
    const r = scoreSlotSheet(slots, checks as any, 3);
    expect(r!.score).toBe(2);
    expect(r!.failed).toEqual(['w2']);
  });
});

describe('documentation playgrounds parse', () => {
  it('CDATA keeps a chat script verbatim, arrows and all', async () => {
    // Parsing is not enough: the Chat DSL text has to survive INTO the tree, or
    // CDATA would have fixed the XML error by hiding the script.
    const md = readFileSync(path.join(ROOT,
      'packages/shared/components/blocks/scenario/Chat/Chat.md'), 'utf8');
    const xml = snippets(md)[1];
    const parsed: any = await parseOLX(`<Vertical id="cdata_check">\n${xml}\n</Vertical>`,
      [toMemoryRef('/d/cdata.olx')], undefined, TEST_NS);
    expect(JSON.stringify(parsed)).toContain('sidebar <- summary');
  });

  for (const rel of DOCS) {
    const md = readFileSync(path.join(ROOT, rel), 'utf8');
    snippets(md).forEach((xml, i) => {
      it(`${path.basename(rel)} playground #${i + 1}`, async () => {
        // A playground may hold sibling roots -- the renderer wraps them, and a
        // bare XML parse would call that a syntax error. Wrap the same way, so
        // this checks the SNIPPET rather than the absence of a wrapper.
        const wrapped = `<Vertical id="doc_snippet_${i}">\n${xml}\n</Vertical>`;
        const parsed: any = await parseOLX(
          wrapped, [toMemoryRef(`/docs/${path.basename(rel)}-${i}.olx`)], undefined, TEST_NS);
        expect(parsed).toBeTruthy();
        // PARSING IS NOT ACCEPTANCE, and asserting only that it RESOLVED let three
        // worked examples ship that the engine rejects outright: DefaultGrader
        // wrote `score`/`feedback` on the grader instead of on a `*Match` rule,
        // LineInput wrote `caseInsensitive` for `ignoreCase`, and MatchingGrader
        // passed ActionButton's REQUIRED `label` as a child. `parseOLX` returns
        // its complaints rather than throwing them, so a resolved promise says
        // nothing about whether the snippet is valid.
        //
        // CONFIG ERRORS ARE NOT THE SNIPPET'S FAULT. Six CustomGrader playgrounds
        // need an initialised config to resolve their grader, which this harness
        // does not provide; failing them here would report the harness, not the
        // documentation. They are excluded by MESSAGE, not by file, so a real
        // error in one of those files is still caught.
        const errs = ((parsed.errors ?? []) as Array<{ message?: string }>)
          .filter(e => !/Config not initialized/i.test(String(e?.message ?? '')));
        expect(errs.map(e => String(e?.message ?? '').split('\n')[0])).toEqual([]);
      });
    });
  }
});
