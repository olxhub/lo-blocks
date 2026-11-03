// packages/shared/components/blocks/input/ChoiceInput/defaultCodes.ts
//
// Default CODES for choice options — a breadcrumb, not a feature.
//
// A code is the option's number in the survey-methodology sense: the SPSS
// code, the Qualtrics "recode value", the number that goes in the column when
// the response becomes data. It is NOT a score, a grade, or points, and
// nothing here touches the platform's grading vocabulary (correct, score,
// points). `<Key code="-2">` does not mean "minus two points"; it means
// "this response is recorded as -2". A Distractor may carry a code as
// happily as a Key, and an instrument with no right answer (a Likert scale)
// is codes all the way down with no grading in sight.
//
// WHY A TABLE AT ALL
//
// OLX is meant to make easy things easy. An author writing
//
//     <Key> True </Key>
//
// has said everything a human needs: the option reads "True", its value is
// "true", and its code is 1. The platform should eventually parse that as
//
//     <Key id="…" value="true" code="1"> True </Key>
//
// This table is the last link in that chain, wired up and working; the
// earlier links (value from text, id from input+value) are NOT built yet.
// See INFERENCE.md in this directory for the whole chain, what exists today,
// and what is missing.
//
// BREADCRUMB RULES (the same ones the value-state predicate table carries)
//
//   - This table MAY be changed if it turns out not to make sense. The
//     numbers below are the conventional ones, not sacred ones.
//   - It MUST NOT be deleted unless it is replaced by something that serves
//     the same use cases. The point is the use cases, not the mapping.
//   - An explicit `code=` ALWAYS wins. The table only speaks when the author
//     did not. A code that disagrees with the EFFECTIVE default draws a
//     parse-time warning, with no exemptions — a flipped sign is exactly the
//     typo the guard exists to catch.
//
// REVERSE-CODED ITEMS
//
// "Reverse-coded item" is the psychometric term: an item worded so that
// agreeing with it means the opposite of agreeing with the rest of the
// scale. The reversal belongs to the ITEM, not to each option, so it is
// declared once on the input — `<ChoiceInput reverseCoded="true">` — and the
// table is negated for that item's options (agree → -1, strongly_disagree →
// 2). That is the EFFECTIVE default: what an option with no `code=` gets,
// and what an explicit `code=` is checked against.
//
// Negation is plain arithmetic, so the boolean family reverses badly: `true`
// becomes -1 and `false` stays 0 under `reverseCoded`, which is rarely what
// anyone wants. A reversed true/false or yes/no item should carry explicit
// codes instead of leaning on the table.
//
// None of this is a score or a grade — a reversed item is still recorded,
// not marked.
//
// SCOPE OF THE KEYS
//
// The keys are English VALUES, not display labels. A Polish Likert item
// writes `<Key value="agree" code="-1">Zgadzam się</Key>`: the label is
// translated, the value is not, and so the value still finds its default.
// A value the table does not know yields `undefined`, which is the honest
// answer — better than guessing a number that lands in someone's dataset.
//
import { z } from 'zod';
import { elementKids, elementTag } from '@/lib/content/xmlParser';
import type { RawXmlNode } from '@/lib/content/xmlParser';

/**
 * Conventional codes, keyed by NORMALIZED value (see `normalizeCodeKey`).
 *
 * Three families, deliberately kept small:
 *   - booleans      true/false, yes/no        →  1 / 0
 *   - the midpoint  neutral                   →  0
 *   - agreement     a signed Likert scale     → -2 … 2
 *
 * Agreement is signed rather than 1-5 because a signed scale is what makes
 * reversed items reversible by negation, and what makes a sum of codes mean
 * something on its own ("net agreement") without knowing the item count.
 */
export const DEFAULT_CODES: Readonly<Record<string, number>> = Object.freeze({
  true: 1,
  yes: 1,
  false: 0,
  no: 0,
  neutral: 0,
  agree: 1,
  disagree: -1,
  strongly_agree: 2,
  strongly_disagree: -2,
  somewhat_agree: 1,
  somewhat_disagree: -1,
});

/**
 * The lookup key for a value: case-folded, with spaces and underscores
 * treated as the same character.
 *
 *   "Strongly Agree" → "strongly_agree"
 *   "STRONGLY_AGREE" → "strongly_agree"
 *   "  yes  "        → "yes"
 *
 * Hyphens are deliberately NOT folded — "strongly-agree" finds no default.
 * Widening this is a table change, which the breadcrumb rules allow; do it
 * when a real course needs it, not on speculation.
 */
export function normalizeCodeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '_');
}

/**
 * The EFFECTIVE default code for an option value, or `undefined` when the
 * table has nothing to say. Callers use it only as a fallback behind an
 * explicit `code=`.
 *
 * `reverseCoded` negates the table for a reverse-coded item (see the header):
 * `agree` → -1, `strongly_disagree` → 2. Zero stays zero rather than
 * becoming -0, so the number that reaches a dataset prints as "0".
 *
 * This is the ONE place the flip happens. Every consumer — the `code` and
 * `codes` selectors, graders, the parse-time typo guard — reads the default
 * through here, so none of them can disagree about what an item's options
 * mean.
 */
export function defaultCodeForValue(value: unknown, reverseCoded = false): number | undefined {
  if (typeof value !== 'string') return undefined;
  const code = DEFAULT_CODES[normalizeCodeKey(value)];
  if (code === undefined) return undefined;
  return reverseCoded && code !== 0 ? -code : code;
}

/**
 * The `code=` attribute schema, shared by every option child of a choice
 * input (Key, Distractor).
 *
 * Codes arrive from XML as strings. A code must be a FINITE number — "" and
 * "one" and "1e999" are parse errors, not silent zeros or Infinities, because
 * a wrong number in a dataset is worse than a failed build.
 */
export const z_option_code = z.union([z.string(), z.number()])
  .transform(v => {
    if (typeof v === 'number') return v;
    const trimmed = String(v).trim();
    return trimmed === '' ? NaN : Number(trimmed);
  })
  .refine(Number.isFinite, {
    message: 'code must be a finite number (e.g. code="-2", code="0", code="1.5")',
  });

/** The shared `describe()` text, so Key and Distractor cannot drift. */
export const CODE_ATTRIBUTE_DESCRIPTION =
  'Numeric CODE recorded when this option is selected — the survey-methodology '
  + 'sense of the word (SPSS code, Qualtrics recode value), NOT a score, grade, '
  + 'or points. On a reverse-coded item, mark the item reverseCoded="true" and '
  + 'write the reversed codes here (agree="-1"), so every consumer reads the '
  + 'same numbers. Read back as @inputId.code.';

/** One warning per option and mismatch, not one per re-parse (the same file
 *  is parsed again on reload, and by every test that reparses it). */
const warnedCodeMismatches = new Set<string>();

/** Test-only: forget which mismatches have already been warned about. */
export function resetCodeMismatchWarnings(): void {
  warnedCodeMismatches.clear();
}

/**
 * Typo guard: an explicit code that disagrees with the effective default for
 * its own value is legal, but it is also exactly what a fat-fingered
 * `code="11"` looks like. So: a WARNING, never an error, and the explicit
 * code is used either way.
 *
 * There are NO exemptions. A code that is the default with its sign flipped
 * is not evidence of a reversed item — it is the single easiest typo to make
 * in a column of signed numbers, and forgiving it would blind the guard to
 * the one mistake it is best placed to catch. An item that really is
 * reversed says so on the item (`<ChoiceInput reverseCoded="true">`), which
 * negates the table for its options; the guard then compares against THAT,
 * so a fully reversed item with explicit reversed codes is silent and a
 * single un-reversed code inside it warns.
 *
 * Note the zero-default values (`false`, `no`, `neutral`): zero is its own
 * negation, so they read the same either way; an explicit nonzero code on a
 * 0-default value warns whether or not the item is reversed.
 *
 * Silent when the option has no code, no value, or a value the table does
 * not know (the Polish-label case, and every domain-specific value).
 *
 * `attrs.code` may be a parsed number or the raw attribute string, because
 * this runs from the ITEM's parser (below) — before the option's own schema
 * has coerced it. A code that is not a finite number is the option's own
 * parse error, not a mismatch, and is passed over here.
 */
export function warnOnCodeMismatch(
  attrs: Record<string, any>, tag: string, reverseCoded = false
): void {
  const { value } = attrs;
  const code = typeof attrs.code === 'number' ? attrs.code : Number(String(attrs.code ?? '').trim());
  if (!Number.isFinite(code) || attrs.code === undefined || attrs.code === '') return;
  if (typeof value !== 'string') return;
  const expected = defaultCodeForValue(value, reverseCoded);
  if (expected === undefined || expected === code) return;

  const warnKey = `${attrs.id ?? ''}:${tag}:${normalizeCodeKey(value)}:${code}`;
  if (warnedCodeMismatches.has(warnKey)) return;
  warnedCodeMismatches.add(warnKey);
  console.warn(
    `⚠️  <${tag} value="${value}" code="${code}">: code ${code} differs from the `
    + `default code ${expected} for "${value}"`
    + `${reverseCoded ? ' on a reverseCoded item' : ''}`
    + '; explicit code is used — check for a typo.'
  );
}

/** Tags whose `code=` this guard checks, and tags that own their own codes. */
const OPTION_TAGS = new Set(['Key', 'Distractor']);
const CODED_INPUT_TAGS = new Set(['ChoiceInput', 'CheckboxInput']);

/**
 * Run the typo guard over one item's option children, from that item's own
 * parser.
 *
 * It has to live here rather than on `Key`/`Distractor` themselves: whether a
 * code is wrong depends on whether the ITEM is reverse-coded, and an option's
 * `validateAttributes` is handed only its own attributes. The item's parser
 * is the one place that sees both the parent's parsed attributes and its
 * children — the same reason `NumberLineInput` checks its `<Tick>` range
 * there.
 *
 * The walk descends through wrapper markup (options need not be direct
 * children) but stops at a nested ChoiceInput/CheckboxInput, which is a
 * different item with its own `reverseCoded`. Options reached only by
 * `target=` are not checked: they belong to no item at parse time, so there
 * is nothing to reverse them by.
 */
export function warnOnOptionCodeTypos(
  { rawParsed, tag, attributes }: { rawParsed: RawXmlNode; tag: string; attributes: Record<string, any> }
): void {
  const reverseCoded = attributes?.reverseCoded === true;

  const walk = (kids: RawXmlNode[]): void => {
    for (const kid of kids) {
      const kidTag = elementTag(kid);
      if (kidTag === undefined || CODED_INPUT_TAGS.has(kidTag)) continue;
      if (OPTION_TAGS.has(kidTag)) {
        warnOnCodeMismatch(kid[':@'] ?? {}, kidTag, reverseCoded);
        continue;
      }
      walk(elementKids(kid, kidTag));
    }
  };

  walk(elementKids(rawParsed, tag));
}
