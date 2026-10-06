// Equal AND in the same order, at every depth -- across the JSON boundary.
//
// Ported from `migrated_tables.same_shape` (goal K).
//
// I FIRST CALLED THIS UNPORTABLE, AND THAT WAS WRONG. The reasoning was that
// the check exists to catch two things JSON destroys in transit: python TYPE
// IDENTITY (its first line is `type(a) is not type(b)`, and the failure it was
// written for was values "turning from tuples into lists") and DICT KEY ORDER
// ("`==` calls these equal; the order is the data" -- and JavaScript reorders
// integer-like object keys ascending, while `agreement.BLOCKS` is keyed 1,2,3).
// Both are true of a NAIVE encoding. Neither is a property of the boundary.
//
// The package already carries tagged python values across it -- `decodeKey` and
// `decodeValue` handle `{__tuple__: [...]}` and `{__frozenset__: [...]}`, and
// the records spell tuple keys both tagged and bare. What those helpers do is
// DECODE the tag away, which is right for comparing by value and wrong here:
// this rule needs the distinction KEPT. So the payload uses a shape form that
// preserves exactly what the check measures:
//
//     dict   -> {__dict__: [[key, value], ...]}   ordered pairs, never an object
//     tuple  -> {__tuple__: [...]}
//     list   -> a plain array
//     scalar -> itself
//
// A dict must never arrive as a JS object: that is the whole of the key-order
// hazard, and an ordered pair array is immune to it. The encoder is the thing
// to get right, and it belongs on the python side where the types still exist.

import { pyReprStr } from './pythonRepr';

export type Shape = unknown;

const isTagged = (v: unknown, tag: string): boolean =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
  && tag in (v as Record<string, unknown>);

const dictPairs = (v: unknown): Array<[unknown, unknown]> =>
  ((v as { __dict__: Array<[unknown, unknown]> }).__dict__ ?? []);

const tupleItems = (v: unknown): unknown[] =>
  ((v as { __tuple__: unknown[] }).__tuple__ ?? []);

/** What `type(x).__name__` says for a value in shape form. */
export function shapeTypeName(v: unknown): string {
  if (isTagged(v, '__dict__')) return 'dict';
  if (isTagged(v, '__tuple__')) return 'tuple';
  if (isTagged(v, '__frozenset__')) return 'frozenset';
  // A RESOLVED STRING IS STILL A STRING: the tag carries its two
  // spellings, not a new type, and must not read as a dict.
  if (isTagged(v, '__ref__')) return 'str';
  if (Array.isArray(v)) return 'list';
  if (v === null || v === undefined) return 'NoneType';
  switch (typeof v) {
    case 'string':  return 'str';
    case 'boolean': return 'bool';
    case 'number':  return Number.isInteger(v) ? 'int' : 'float';
    default:        return 'dict';
  }
}

/** python's `repr` for the short key lists the messages print. */
const keyList = (keys: unknown[]): string =>
  '[' + keys.map(k => (typeof k === 'string' ? `'${k}'` : String(k))).join(', ') + ']';

export function sameShape(a: Shape, b: Shape, path = ''): string[] {
  const out: string[] = [];
  const ta = shapeTypeName(a);
  const tb = shapeTypeName(b);
  if (ta !== tb) return [`${path || '<root>'}: ${ta} vs ${tb}`];

  if (ta === 'dict') {
    const pa = dictPairs(a);
    const pb = dictPairs(b);
    const ka = pa.map(([k]) => k);
    const kb = pb.map(([k]) => k);
    // ORDER IS THE DATA. Compared as sequences, not as sets.
    if (JSON.stringify(ka) !== JSON.stringify(kb)) {
      const setB = new Set(kb.map(k => JSON.stringify(k)));
      const setA = new Set(ka.map(k => JSON.stringify(k)));
      const onlyA = ka.filter(k => !setB.has(JSON.stringify(k)));
      const onlyB = kb.filter(k => !setA.has(JSON.stringify(k)));
      if (onlyA.length || onlyB.length) {
        out.push(`${path || '<root>'}: keys differ -- only-read ` +
                 `${keyList(onlyA.slice(0, 3))}, only-authored ${keyList(onlyB.slice(0, 3))}`);
      } else {
        out.push(`${path || '<root>'}: SAME KEYS, DIFFERENT ORDER -- ` +
                 `read ${keyList(ka.slice(0, 4))}, authored ${keyList(kb.slice(0, 4))}. \`==\` ` +
                 `calls these equal; the order is the data.`);
      }
      return out;
    }
    for (let i = 0; i < pa.length; i++) {
      out.push(...sameShape(pa[i][1], pb[i][1], `${path}.${String(pa[i][0])}`));
    }
    return out;
  }

  if (ta === 'list' || ta === 'tuple') {
    const xs = ta === 'tuple' ? tupleItems(a) : (a as unknown[]);
    const ys = ta === 'tuple' ? tupleItems(b) : (b as unknown[]);
    if (xs.length !== ys.length) return [`${path}: ${xs.length} entries vs ${ys.length}`];
    for (let i = 0; i < xs.length; i++) {
      out.push(...sameShape(xs[i], ys[i], `${path}[${i}]`));
    }
    return out;
  }

  // THE SCALAR ARM FORGIVES AN ENCODING, NOT A CONTENT, DIFFERENCE. The history
  // rewrite replaces a student's sentence with a `{{corpus:...}}` reference
  // wherever it appears, and the reference records the WHITESPACE SHAPE of the
  // span it replaced -- which differs between a .py dict value and a JSON string
  // holding the same sentence at a different indent. Measured 2026-09-21: two
  // tables reported a mismatch at the first `shape=` suffix with every other
  // byte identical. Each substitution is individually correct and both expand to
  // the same text.
  //
  // EXPANDING NEEDS THE RESPONSE RECORDS, so python resolves and tags:
  //     {__ref__: {raw: "...{{corpus:...}}...", expanded: "..."}}
  // The comparison uses `expanded` -- which keeps the teeth, because a genuine
  // drift still differs after expanding -- and the MESSAGE prints `raw`, because
  // that is what a reader has to go and edit.
  const scalar = (v: unknown) =>
    isTagged(v, '__ref__')
      ? (v as { __ref__: { raw: string; expanded: string } }).__ref__
      : { raw: v as unknown, expanded: v as unknown };
  const sa = scalar(a);
  const sb = scalar(b);
  if (sa.expanded !== sb.expanded) {
    out.push(`${path}: ${pyReprTrunc(sa.raw)} != ${pyReprTrunc(sb.raw)}`);
  }
  return out;
}

/** python's `f"{x!r:.50}"` -- repr, then truncated to 50 characters. */
export function pyReprTrunc(v: unknown, width = 50): string {
  const r = typeof v === 'string' ? pyReprStr(v)
          : v === null || v === undefined ? 'None'
          : typeof v === 'boolean' ? (v ? 'True' : 'False')
          : String(v);
  return r.slice(0, width);
}
