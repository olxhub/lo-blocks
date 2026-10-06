// Does any prompt reproduce a student's own words without declaring it?
//
// Ported from `enforcement.check_rule_examples_are_not_corpus` (goal K).
//
// THE CITATION CHECK POLICES QUOTES THAT NAME A PARTICIPANT BY NUMBER, because
// those are what the registry can record. It cannot see an UNATTRIBUTED
// reproduction -- and that gives the answer away just as completely, while the
// cell it came from is still COUNTED, so the item scores as if the student had
// not been handed their own sentence back.
//
// PUNCTUATION IS STRIPPED, NOT FOLDED, and that matters more than it looks.
// Tokenising on whitespace makes a comma or a quote mark ride along on the word
// it touches. A worked example in a prompt is always written inside quotation
// marks -- that is what makes it an example -- so its first and last tokens
// were `"i` and `friday"`, matching nothing in a student's answer, and any
// interior comma broke the run again. A 6-gram could only land if it threaded
// between both ends and every mark between. The check was close to blind to the
// one thing it exists to catch: one item's rule quoted a student word for word,
// that student was counted, and it passed at every commit.
//
// INTRA-WORD APOSTROPHES SURVIVE, so "don't" stays one token.
//
// A GRAM SHARED BY TWO STUDENTS IS NOT A QUOTATION -- it is how people write.
// Only a gram unique to ONE participant, and absent from the question itself,
// counts: a student echoing the question back is not us quoting the student.

export type RuleExamplesPayload = {
  /** item -> pid -> the student's whole text for that cell, unnormalised. */
  corpus: Record<string, Record<string, string>>;
  items: Array<{
    h: number;
    id: string;
    /** Every prompt-bearing string for this item, already gathered. */
    parts: string[];
    question: string;
    /** pids not counted on this item. */
    excluded: number[];
  }>;
  /** `<item>|<pid>` pairs whose leak is declared and not yet fixed. */
  backlog: string[];
};

const QUOTE_N = 6;

export function norm(s: string): string {
  let t = String(s ?? '').toLowerCase()
    .split('\u2019').join("'").split('\u2018').join("'")
    .split('\u201c').join('"').split('\u201d').join('"')
    .split('\u2014').join('-');
  t = t.replace(/[^a-z0-9' ]+/g, ' ');
  t = t.replace(/(^|\s)'+|'+(\s|$)/g, ' ');
  return t.split(/\s+/).filter(Boolean).join(' ');
}

export function grams(text: string, n: number = QUOTE_N): Set<string> {
  const w = String(text ?? '').split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join('\u0000'));
  return out;
}

export function ruleExamplesAreNotCorpus(p: RuleExamplesPayload): string[] {
  const corpus = p?.corpus ?? {};
  if (!Object.keys(corpus).length) return [];   // corpus absent; nothing to compare

  const out: string[] = [];
  const declared = new Set(p?.backlog ?? []);
  const seen = new Set<string>();

  for (const item of p?.items ?? []) {
    const prompt = grams(norm((item.parts ?? []).join(' ')));
    if (!prompt.size) continue;

    const per = new Map<number, Set<string>>();
    for (const [pid, body] of Object.entries(corpus[item.id] ?? {})) {
      per.set(Number(pid), grams(norm(body)));
    }
    const shared = new Map<string, number>();
    for (const gs of per.values()) {
      for (const g of gs) shared.set(g, (shared.get(g) ?? 0) + 1);
    }
    const asked = grams(norm(item.question ?? ''));
    const excluded = new Set(item.excluded ?? []);

    for (const pid of [...per.keys()].sort((a, b) => a - b)) {
      if (excluded.has(pid)) continue;
      const own: string[] = [];
      for (const g of per.get(pid)!) {
        if (prompt.has(g) && shared.get(g) === 1 && !asked.has(g)) own.push(g);
      }
      if (!own.length) continue;
      const key = `${item.id}|${pid}`;
      if (declared.has(key)) { seen.add(key); continue; }
      own.sort();
      out.push(
        `H${item.h} ${item.id}: the prompt reproduces p${pid}'s own words ` +
        `("...${own[0].split('\u0000').join(' ')}...") and p${pid} is still ` +
        `COUNTED on this item. Either invent the example, or ` +
        `register p${pid} in handouts \`cited_participants\` and accept ` +
        `the smaller denominator`);
    }
  }
  // A BACKLOG ENTRY THAT NO LONGER FIRES HAS BEEN FIXED; leaving it listed
  // would exempt a future leak on the same cell.
  for (const key of [...declared].filter(k => !seen.has(k)).sort()) {
    const [item, pid] = key.split('|');
    out.push(
      `CORPUS_QUOTE_BACKLOG lists ${item}/p${pid}, which no longer ` +
      `reproduces that participant. Remove it from the list`);
  }
  return out;
}
