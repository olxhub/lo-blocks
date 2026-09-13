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
//     did not.
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
 * The default code for an option value, or `undefined` when the table has
 * nothing to say. Callers use it only as a fallback behind an explicit
 * `code=`.
 */
export function defaultCodeForValue(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  return DEFAULT_CODES[normalizeCodeKey(value)];
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
  + 'or points. Reversed Likert items are reversed here (agree="-1"), so every '
  + 'consumer reads the same numbers. Read back as @inputId.code.';

/** One warning per option and mismatch, not one per re-parse or re-render
 *  (validateAttributes runs on both paths). */
const warnedCodeMismatches = new Set<string>();

/** Test-only: forget which mismatches have already been warned about. */
export function resetCodeMismatchWarnings(): void {
  warnedCodeMismatches.clear();
}

/**
 * Typo guard: an explicit code that disagrees with the default for its own
 * value is legal — reversed items depend on it — but it is also exactly what
 * a fat-fingered `code="11"` looks like. So: a WARNING, never an error, and
 * the explicit code is used either way.
 *
 * Silent when the option has no code, no value, or a value the table does
 * not know (the Polish-label case, and every domain-specific value).
 */
export function warnOnCodeMismatch(attrs: Record<string, any>, tag: string): void {
  const { code, value } = attrs;
  if (typeof code !== 'number' || typeof value !== 'string') return;
  const expected = defaultCodeForValue(value);
  if (expected === undefined || expected === code) return;

  const warnKey = `${attrs.id ?? ''}:${tag}:${normalizeCodeKey(value)}:${code}`;
  if (warnedCodeMismatches.has(warnKey)) return;
  warnedCodeMismatches.add(warnKey);
  console.warn(
    `⚠️  <${tag} value="${value}" code="${code}">: code ${code} differs from the `
    + `default code ${expected} for "${value}"; explicit code is used — check for a typo.`
  );
}
