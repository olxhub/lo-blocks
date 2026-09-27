// Has a copy of shared prose drifted from the string it was copied from?
//
// Ported from `enforcement.check_gold_shared_prose_has_not_drifted` (goal K).
// Python fetches the canonical string and the per-cell declarations from the
// gold file; the comparison lives here.
//
// WHAT IT CATCHES, and why "nearly equal" is the signal rather than "unequal".
// These cells once shared ONE named string. The gold migration gave each cell
// its own copy, and copies drift: an edit lands on one and not the others, and
// nothing complains, because each is now a separate declaration that is free to
// say whatever it says. A cell 90% identical to the canonical text but not
// equal to it is therefore not a variant -- it is the same sentence, edited
// once, in one place.
//
// EQUAL IS SILENT and very different is silent. Only the narrow band between
// them means "this was a copy and somebody changed it".
//
// THE THRESHOLD IS ONLY MEANINGFUL AGAINST PYTHON'S OWN MEASURE, which is why
// `sequenceRatio` reproduces `difflib.SequenceMatcher.ratio()` exactly rather
// than approximating it -- verified against CPython on 266 pairs, including the
// long inputs where `autojunk` engages, with a worst delta of zero. Any other
// similarity function reports a different SET of cells at 0.90.

import { decodeTable, pyRepr } from './pythonRepr';
import { sequenceRatio } from './sequenceRatio';

export type GoldSharedProsePayload = {
  /** The shared string the cells were copied from. */
  canonical: unknown;
  // THE TABLE AS THE RECORDS STORE IT, tags and all: `{__dict__: [[k, v]...]}`
  // with tuple keys as `{__tuple__: [...]}`. An earlier version took keys
  // PRE-RENDERED by python, which worked for the python-driven path and left
  // the rule uncallable from inside lo-blocks -- a native caller reading
  // $COURSE_METADATA has no python to ask. The records are self-describing, so
  // this reads them directly and renders the key itself.
  /** The declarations table, tagged as stored, or a plain string-keyed object. */
  cells: unknown;
  /** Name of the canonical declaration, for the finding text. */
  canonicalName?: string;
  /** Name of the table, for the finding text. */
  cellsName?: string;
  /** Drift band floor. Python's is 0.90. */
  threshold?: number;
};

/** Python's `f"{ratio:.0%}"` — percent, no decimals, half-even at the edges. */
function pctLikePython(r: number): string {
  const scaled = r * 100;
  // Python formats with round-half-even on the DECIMAL representation.
  const fixed = scaled.toFixed(20);
  const [intPart, frac] = fixed.split('.');
  let n = Number(intPart);
  const rest = frac.replace(/0+$/, '');
  if (rest) {
    const first = Number(rest[0]);
    if (first > 5) n += 1;
    else if (first === 5) {
      if (rest.length > 1) n += 1;          // strictly greater than a half
      else if (n % 2 === 1) n += 1;         // exact half: round to even
    }
  }
  return `${n}%`;
}

export function goldSharedProseHasNotDrifted(p: GoldSharedProsePayload): string[] {
  const canonicalName = p?.canonicalName ?? '_1C_GATE_CEILING';
  const cellsName = p?.cellsName ?? 'DECLARED_CEILING_CELLS';
  const canonical = p?.canonical;
  if (typeof canonical !== 'string') {
    const kind = canonical === null ? 'NoneType'
      : Array.isArray(canonical) ? 'list'
      : typeof canonical === 'number' ? (Number.isInteger(canonical) ? 'int' : 'float')
      : typeof canonical === 'object' ? 'dict' : typeof canonical;
    return [`${canonicalName} is ${kind}, expected the shared prose string`];
  }
  const out: string[] = [];
  const threshold = p?.threshold ?? 0.90;
  for (const { key, value } of decodeTable(p?.cells)) {
    if (typeof value !== 'string' || value === canonical) continue;
    const ratio = sequenceRatio(canonical, value);
    if (ratio >= threshold) {
      out.push(
        `${cellsName}[${pyRepr(key)}] is ${pctLikePython(ratio)} identical to `
        + `${canonicalName} but not equal to it -- these were one named `
        + `string before the gold migration, so this is a copy that has `
        + `drifted, not a separate declaration. Edit them together or `
        + `make the difference deliberate and large.`);
    }
  }
  return out;
}
