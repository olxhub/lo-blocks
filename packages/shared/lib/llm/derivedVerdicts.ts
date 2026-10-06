// Dispatch for checks whose verdict is read off the page.
//
// NOT a leaf, unlike slotSheet.ts: it reaches into the chart's parser so that a
// verdict about plotted data is decided by the same code that plots it. Both
// callers — LLMAction, for items that mix derived checks with judgements, and
// DerivedChecks, for items with no model call at all — come through here so the
// dispatch exists once.

import { MET, ABSENT, type DerivedRule } from './slotSheet';
import { completeVerdict, dataVerdict }
  from '@/components/blocks/display/SelfMonitorPlot/dataVerdict';

export type DerivedVerdict = { verdict: string; evidence: string };

// These verdicts are decided HERE rather than by a model, so they have to name
// the canonical vocabulary rather than restate it. Writing 'met' as a literal
// worked only while every consuming slot happened to list `met` first — an
// unguarded coincidence between two files, and one that would have failed
// silently by scoring every derived check absent.

/**
 * Is a value present at all?
 *
 * For a closed choice there is nothing to parse and nothing to be wrong: the
 * rubric's other failure — naming something that is not one of the offered
 * options — cannot happen when the options are the only thing selectable. So the
 * only question left is whether they answered.
 */
function presentVerdict(texts: string[]): DerivedVerdict {
  const filled = texts.filter(t => String(t ?? '').trim()).length;
  return filled === texts.length
    ? { verdict: MET, evidence: 'Answered.' }
    : { verdict: ABSENT, evidence: 'Nothing chosen here.' };
}

/**
 * Is `a` within `budget` edits of `b`?
 *
 * Optimal string alignment (restricted Damerau-Levenshtein) when `allowSwap`, so
 * deletion, insertion, substitution and transposition all cost 1. Plain
 * Levenshtein charges 2 for a swap, which a long target's budget of 2 hides and a
 * short one's budget of 1 does not — `trigge` would have been accepted and
 * `trigegr` refused, an inconsistency resting on word length rather than on how
 * badly the student missed.
 *
 * `allowSwap` is false for short targets, where a swap is too large a share of
 * the word to be a typo — see NO_SWAP_MAX_LEN. The caller decides; this function
 * only counts.
 *
 * MUST MATCH olx_prompts._edit_within exactly. Written out rather than imported
 * because the browser is one of the three engines and has no dictionary or
 * spell-checker available to it.
 */
function editWithin(a: string, b: string, budget: number,
                    allowSwap = true): boolean {
  if (Math.abs(a.length - b.length) > budget) return false;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      let best = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (allowSwap && i > 1 && j > 1
          && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prev2[j - 2] + 1);
      }
      cur.push(best);
    }
    if (Math.min(...cur) > budget) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] <= budget;
}

// Longer targets get a wider budget: more ways to be fumbled, fewer neighbours to
// be confused with. `trigger` (7) stays at 1 so `bigger` cannot satisfy it.
const FUZZY_MIN_LEN = 9;

// At or below this length a target is matched EXACTLY, as a whole token.
//
// Three, not two. Both loose arms stop meaning anything on a short word: a budget
// of 1 against `cat` admits `car`, `can`, `cut` and `bat` — one edit in three
// characters, closer to a rhyme than a spelling — and the substring arm finds
// `cat` inside `catalogue`. Neither shows the student used the term, so a word
// this short has to appear as itself.
const EXACT_MAX_LEN = 3;

// Up to this length a transposition is NOT a single edit.
//
// A swap moves two characters, which on a four-letter word is half of it — and
// the words it reaches are not misspellings but other words: a target of `form`
// would be satisfied by `from`. Above four the swapped pair is a smaller share of
// the word and its neighbours are overwhelmingly typos, so the swap earns its
// usual discount there and not here.
const NO_SWAP_MAX_LEN = 4;

/**
 * Does the student's own text use one of the course's words?
 *
 * The whole answer is searched as one string, not field by field, because the
 * rubric asks whether the word appears ANYWHERE in the response — a student who
 * writes "antecedent" in the first box and not the second has still used it.
 *
 * A literal substring first, which is what carries inflections ("antecedents",
 * "triggered") and settles every correctly spelled answer. Only if that finds
 * nothing are whole tokens compared against the TARGET within a bounded edit
 * distance, which is what carries a misspelling.
 *
 * NO DICTIONARY, deliberately. Correcting a token only when it is not a real word
 * needs a word list in all three engines, and this one runs in a browser. Asking
 * "how close is it to the word we asked for?" is a question every engine can
 * answer identically, and it loses nothing: measured over the corpus, the only
 * token this accepts that a literal search would not is "conequence".
 */
function containsVerdict(texts: string[], words: string[]): DerivedVerdict {
  const haystack = texts.join(' ').toLowerCase();
  const tokens: string[] = haystack.match(/[a-z']+/g) ?? [];
  for (const w of words) {
    const found = w.length <= EXACT_MAX_LEN ? tokens.includes(w) : haystack.includes(w);
    if (found) return { verdict: MET, evidence: `Uses the word "${w}".` };
  }
  for (const w of words) {
    // Only words long enough to be missed by accident rather than by
    // coincidence are matched loosely — four characters and up.
    if (w.length <= EXACT_MAX_LEN) continue;
    const budget = w.length >= FUZZY_MIN_LEN ? 2 : 1;
    const swap = w.length > NO_SWAP_MAX_LEN;
    const typed = tokens.find(tok => editWithin(tok, w, budget, swap));
    if (typed) {
      return { verdict: MET, evidence: `Uses the word "${w}" (spelled "${typed}").` };
    }
  }
  return { verdict: ABSENT,
           evidence: `None of ${words.map(w => `"${w}"`).join(', ')} appears anywhere `
                     + `in the response.` };
}

export function verdictFor(rule: DerivedRule, texts: string[]): DerivedVerdict {
  switch (rule.kind) {
    case 'contains':
      return containsVerdict(texts, rule.words);
    case 'plots':
      return dataVerdict(texts, rule.template);
    case 'complete':
      return completeVerdict(texts, rule.template);
    case 'present':
      return presentVerdict(texts);
    default:
      // parseDerived filters unknown kinds, so this is unreachable from authored
      // content; it exists so a new kind cannot be added to DERIVED_KINDS without
      // being handled here.
      throw new Error(`derived: unhandled kind "${rule.kind}" for \`${rule.key}\``);
  }
}
