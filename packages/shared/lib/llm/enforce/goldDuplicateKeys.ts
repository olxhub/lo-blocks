// Does the gold file say the same thing twice?
//
// Ported from `enforcement.check_gold_tables_have_no_duplicate_keys` (goal K).
//
// TWO KINDS OF DUPLICATE, AND ONLY THE RAW TEXT SEES THE FIRST. `JSON.parse`
// keeps the LAST of two same-named keys, so a duplicate object key has already
// been discarded by the time anything can look at the parsed document -- the
// evidence is gone. The second kind survives parsing: the tagged tables store
// their entries as a LIST OF PAIRS, so two pairs may carry the same key and
// both are present until `decodeTable` collapses them.
//
// Either way one of the two is silently doing nothing, which is the shape that
// matters: two accounts of one ceiling read as two ceilings.

export type GoldDupPayload = {
  /** The gold file's raw text. Not its parsed contents -- see above. */
  raw: string;
  path: string;
};

const WANT = ['GOLD_CEILINGS', 'CORRECTED_GOLD', 'PER_ITEM_EXCLUDE'];

/** Python's `repr` for a decoded key: a string, or a tuple of them. */
function pyKey(k: unknown): string {
  if (Array.isArray(k)) {
    const inner = k.map(pyKey).join(', ');
    return k.length === 1 ? `(${inner},)` : `(${inner})`;
  }
  if (typeof k === 'string') return `'${k.replace(/'/g, "\\'")}'`;
  return String(k);
}

/**
 * Every object key that appears twice in one object, anywhere in the document.
 *
 * `JSON.parse` cannot answer this -- it has already thrown one away -- so the
 * text is walked with a reviver that sees each object's keys in source order.
 * The reviver alone is not enough either: it receives the ALREADY-COLLAPSED
 * object. So the raw text is scanned instead, tracking brace depth so that two
 * keys in DIFFERENT objects are not mistaken for a duplicate.
 */
export function duplicateObjectKeys(raw: string): string[] {
  const dupes = new Set<string>();
  const stack: Array<Set<string>> = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') {
      // Read the string, honouring escapes, then decide if it is a KEY.
      let j = i + 1;
      let s = '';
      while (j < raw.length && raw[j] !== '"') {
        if (raw[j] === '\\') { s += raw[j + 1] ?? ''; j += 2; continue; }
        s += raw[j]; j += 1;
      }
      let k = j + 1;
      while (k < raw.length && /\s/.test(raw[k])) k += 1;
      if (raw[k] === ':' && stack.length) {
        const top = stack[stack.length - 1];
        if (top.has(s)) dupes.add(s);
        top.add(s);
      }
      i = j + 1;
      continue;
    }
    if (ch === '{') stack.push(new Set());
    else if (ch === '}') stack.pop();
    i += 1;
  }
  return [...dupes].sort();
}

export function goldTablesHaveNoDuplicateKeys(p: GoldDupPayload): string[] {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(p.raw) as Record<string, unknown>;
  } catch (e) {
    return [`cannot read the gold file at ${p.path}: ${(e as Error).message}`];
  }
  const problems: string[] = [];
  for (const key of duplicateObjectKeys(p.raw)) {
    problems.push(
      `the gold file has TWO entries keyed '${key}' in one object. ` +
      `\`json.load\` keeps only the last, so the other is silently doing ` +
      `nothing \u2014 merge them, because two accounts of one ceiling read as ` +
      `two ceilings`);
  }
  const decl = (doc.declarations ?? {}) as Record<string, unknown>;
  for (const name of WANT) {
    const raw = decl[name];
    if (raw === undefined || raw === null) {
      problems.push(`${name} is not in the gold file at all`);
      continue;
    }
    let pairs: unknown[] | null = null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)
        && Object.keys(raw).length === 1 && '__dict__' in raw) {
      pairs = (raw as { __dict__: unknown[] }).__dict__;
    } else if (Array.isArray(raw)
               && raw.every(q => Array.isArray(q) && q.length === 2)) {
      pairs = raw;
    }
    if (pairs === null) continue;      // a plain object; the text scan covered it
    const seen = new Set<string>();
    for (const pair of pairs) {
      const [k] = pair as [unknown, unknown];
      // `_detag`: a tagged tuple decodes to a list, which python then makes a
      // tuple so it can go in a set. The rendered form is the comparison key
      // here and the finding's text, so one pass serves both.
      const decoded = (k && typeof k === 'object' && !Array.isArray(k)
                       && '__tuple__' in (k as Record<string, unknown>))
        ? (k as { __tuple__: unknown[] }).__tuple__
        : k;
      const rendered = pyKey(decoded);
      if (seen.has(rendered)) {
        problems.push(
          `${name} has TWO entries for ${rendered}. Only the last survives ` +
          `decoding, so the other is silently doing nothing \u2014 merge ` +
          `them, because two accounts of one ceiling read as two ` +
          `ceilings`);
      }
      seen.add(rendered);
    }
  }
  return problems;
}
