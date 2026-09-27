// The EXACT text the LLM-based grader is shown for a slot, lifted from the
// prompt -- or the deterministic rule that answers it instead.
//
// Ported from `probe.question_for` / `probe._derivation` (goal K). This is what
// makes probe/sweep identity STRUCTURAL: a probe cannot ask a string the sweep
// does not render, because both lift it from the same built prompt.
//
// NOT ASKED OF AN LLM IS NOT THE SAME AS NOT MEASURED. A sweep records a
// derived slot's answer and the ledger scores it like any other; what differs
// is only which grader produced it. So a slot absent from the checklist falls
// through to its DETERMINISTIC rule and the caller probes that -- at zero
// calls, the cheapest probe available. Refusing them was the original mistake:
// it left 42 of 110 credit slots, and every slot of three items, unprobeable.
//
// BOTH SECTIONS SHIP. A slot's `desc` renders under `## Credit components` and
// its `rule` under `## The checklist to return`, in ONE prompt; reporting only
// the checklist half is how a declared sentence read as "gone" while it was in
// front of the grader.

import { sha12 } from '../../../scripts/resolveCorpusRefs';

const CHECKLIST_HEAD = '## The checklist to return';
const CREDIT_HEAD = '## Credit components';

/** `probe.field_sha`: the same normalisation the design shas use. */
export function fieldSha(text: unknown): string {
  return sha12(String(text ?? '').replace(/\s+/g, ' ').trim());
}

function section(prompt: string, head: string): string[] {
  const at = prompt.indexOf(head);
  if (at < 0) return [];
  const rest = prompt.slice(at + head.length);
  const end = /^## /m.exec(rest);
  return (end ? rest.slice(0, end.index) : rest).split('\n');
}

/**
 * slot -> [head, note] for every slot the LLM-based grader is ASKED about.
 *
 * A note may run over SEVERAL LINES -- descs are written as prose and keep
 * their newlines through the render -- so an entry continues until the next
 * line that opens a new slot.
 */
export function entries(prompt: string): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  let key: string | null = null, head = '', body: string[] = [];
  const flush = () => { if (key) out[key] = [head, body.join('\n').trim()]; };
  for (const line of section(prompt, CHECKLIST_HEAD)) {
    const m = /^- `([A-Za-z0-9_]+)`(.*?): ?(.*)$/.exec(line);
    if (m) { flush(); key = m[1]; head = m[2].trim(); body = [m[3]]; continue; }
    const m2 = /^- `([A-Za-z0-9_]+)`(.*)$/.exec(line);
    if (m2) { flush(); key = m2[1]; head = m2[2].trim(); body = []; continue; }
    if (key !== null) body.push(line);
  }
  flush();
  return out;
}

/** slot -> the `desc` half, from the credit-components section. */
export function creditEntries(prompt: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key: string | null = null, body: string[] = [];
  const flush = () => { if (key) out[key] = body.join('\n').trim(); };
  for (const line of section(prompt, CREDIT_HEAD)) {
    const m = /^- `([A-Za-z0-9_]+)`(.*?): ?(.*)$/.exec(line);
    if (m) { flush(); key = m[1]; body = [m[3]]; continue; }
    const m2 = /^- `([A-Za-z0-9_]+)`/.exec(line);
    if (m2) { flush(); key = m2[1]; body = []; continue; }
    if (key !== null) body.push(line);
  }
  flush();
  return out;
}

/** The attributes that make a slot's verdict WITHOUT asking an LLM. */
export const DERIVING_ATTRS = ['expect', 'equals', 'derived', 'maps',
                               'forbid', 'onlyif'];

export type QuestionPayload = {
  /** item -> its runtime prompt (only items with a judging prompt). */
  prompts: Record<string, string>;
  /** item -> the sheet tag its slots are declared on. */
  tags: Record<string, string>;
  /** slot -> every name it may also be known by. */
  aliases: Record<string, string[]>;
  /**
   * `item|slot` -> the slots that answer it between them.
   *
   * A rubric criterion the SHEET decomposes differently: several `reason_*`,
   * several `sentence_*`, a set of type aggregates. There IS a real answer
   * being measured on the sweep; it is just not answered under this name, so
   * the caller is pointed at the slots that DO answer it rather than refused.
   */
  answeredUnder?: Record<string, string[]>;
};

export type Question = {
  item: string; slot: string; kind: string; head: string;
  question: string; sha: string; promptSha: string;
  how?: string[];
};

/**
 * The deterministic rule that answers `slot`, lifted from the sheet tag.
 *
 * EXACT NAME FIRST for the label, alias only as a fallback: an alias group is
 * right for FINDING the clauses that answer a slot and wrong for LABELLING it.
 */
export function derivation(
  item: string, slot: string, tag: string, aliases: string[],
): Question | null {
  if (!tag) return null;
  const names = new Set(aliases.length ? aliases : [slot]);
  const found: Array<[string, string]> = [];
  const labels: string[] = [];
  for (const attr of DERIVING_ATTRS) {
    for (const m of tag.matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))) {
      for (const clause of m[1].split('|')) {
        if (names.has(clause.split(':')[0].trim().replace(/^!/, ''))) {
          found.push([attr, clause.trim()]);
        }
      }
    }
  }
  for (const m of tag.matchAll(/\bslots="([^"]*)"/g)) {
    for (const clause of m[1].split('|')) {
      const h = clause.split(':')[0].trim().replace(/^!/, '');
      if (h === slot) labels.unshift(clause.trim());
      else if (names.has(h)) labels.push(clause.trim());
    }
  }
  if (!found.length) return null;
  const question = found.map(([a, c]) => `${a}="${c}"`).join('\n');
  return {
    item, slot, kind: 'derived', head: labels[0] ?? '', question,
    sha: fieldSha(question), promptSha: '',
    how: [...new Set(found.map(([a]) => a))].sort(),
  };
}

/** `probe.question_for`'s answer, or null when nothing on the sheet answers it. */
export function questionFor(
  item: string, slot: string, p: QuestionPayload,
): Question | null {
  const prompt = p.prompts?.[item] ?? '';
  const asked = prompt ? entries(prompt) : {};
  if (slot in asked) {
    const [head, note] = asked[slot];
    // BOTH HALVES, in prompt order.
    const credit = creditEntries(prompt)[slot] ?? '';
    const whole = [credit, note].filter(Boolean).join('\n').trim();
    return { item, slot, kind: 'asked', head, question: whole,
             sha: fieldSha(whole), promptSha: fieldSha(prompt) };
  }
  const direct = derivation(item, slot, p.tags?.[item] ?? '',
                            p.aliases?.[slot] ?? [slot]);
  if (direct) return direct;

  // DECOMPOSED, NOT MISSING. Point the caller at the slots that answer it.
  const under = p.answeredUnder?.[`${item}|${slot}`];
  if (under?.length) {
    const parts: Array<[string, string, string, string]> = [];
    for (const name of under) {
      if (name in asked) {
        const [h, note] = asked[name];
        parts.push([name, 'asked', h, note]);
      } else {
        const d = derivation(name === slot ? slot : name, name,
                             p.tags?.[item] ?? '',
                             p.aliases?.[name] ?? [name]);
        if (d) parts.push([name, 'derived', d.head, d.question]);
      }
    }
    if (parts.length) {
      const body = parts.map(([n, k, h, q]) => `[${k}] \`${n}\` ${h}\n${q}`)
        .join('\n\n');
      return {
        item, slot, kind: 'composite',
        head: parts.map(([n]) => `\`${n}\``).join(' + '),
        question: body, sha: fieldSha(body),
        promptSha: prompt ? fieldSha(prompt) : '',
      };
    }
  }
  return null;
}
