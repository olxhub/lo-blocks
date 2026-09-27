// Python's `repr()` for the key shapes the course records actually use.
//
// Goal K. Findings quote their key with `{key!r}`, and the gold tables are
// keyed by TUPLES -- `('1c', 1)`. An earlier version of the shared-prose port
// had python pre-render the key and pass the string across, which works for the
// python-driven path and makes the rule UNCALLABLE NATIVELY: a lo-blocks caller
// reading `$COURSE_METADATA` for itself has no python to ask. Every rule in this
// package has to be runnable from inside lo-blocks, so the rendering belongs
// here.
//
// It is the same judgement as `sequenceRatio`: rather than approximate a python
// behaviour, transcribe it and verify differentially against CPython. A
// five-line formatter is not exempt from the standard applied to a hundred-line
// algorithm.
//
// SCOPE IS DELIBERATELY NARROW. This handles strings, integers, booleans, None,
// floats and tuples of those -- the shapes these records use. Anything else
// THROWS rather than guessing, because a silently wrong key renders a finding
// that names a cell nobody can find.

/** The decoded form of a key from the tagged JSON the course records use. */
export type PyKey = string | number | boolean | null | PyKey[];

/** `{__tuple__: [...]}` as the records store a tuple key. */
export type TaggedKey = { __tuple__: unknown[] } | string | number | boolean | null;

/** Python's `repr()` for a string: single quotes, unless that forces escaping. */
export function pyReprStr(s: string): string {
  const hasSingle = s.includes("'");
  const hasDouble = s.includes('"');
  const body = s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  // CPython prefers ' and switches to " only when the value has ' and no ".
  if (hasSingle && !hasDouble) return `"${body}"`;
  return `'${body.replace(/'/g, "\\'")}'`;
}

/** Python's `repr()` for the key shapes these records use. */
export function pyRepr(v: PyKey): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'string') return pyReprStr(v);
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    // Python's float repr is the shortest round-tripping form, which is what
    // JavaScript's Number->String also produces; the exponent spelling differs
    // only outside the range these keys use.
    return String(v);
  }
  if (Array.isArray(v)) {
    // A ONE-TUPLE CARRIES ITS COMMA -- `('a',)` -- and dropping it renders a
    // key that reads as a parenthesised string instead of a tuple.
    if (v.length === 1) return `(${pyRepr(v[0])},)`;
    return `(${v.map(pyRepr).join(', ')})`;
  }
  throw new Error(
    `pyRepr: no rendering for ${typeof v}; these records key on strings, ` +
    `numbers and tuples of them, and guessing would name a cell nobody can find`);
}

/** Decode one key from the tagged JSON form the course records use. */
export function decodeKey(k: unknown): PyKey {
  if (k !== null && typeof k === 'object' && !Array.isArray(k)
      && '__tuple__' in (k as Record<string, unknown>)) {
    const items = (k as { __tuple__: unknown[] }).__tuple__;
    return (items ?? []).map(decodeKey);
  }
  // `{__frozenset__: [...]}` IS A SET, and the records carry it for keys whose
  // parts are unordered -- `VERDICT_SPACE_DIVERGENCES` is keyed by a pair of
  // them. It decodes to a sorted array here: the callers compare shapes by
  // VALUE, and an order-dependent comparison of an unordered thing is a bug
  // waiting for the day somebody writes the parts the other way round.
  if (k !== null && typeof k === 'object' && !Array.isArray(k)
      && '__frozenset__' in (k as Record<string, unknown>)) {
    const items = (k as { __frozenset__: unknown[] }).__frozenset__ ?? [];
    return items.map(decodeKey).sort((a, b) => (String(a) < String(b) ? -1 : 1));
  }
  // A PLAIN ARRAY IN KEY POSITION IS A TUPLE. The records spell tuple keys two
  // ways: `gold.json` tags them `{__tuple__: [...]}`, and `course.json` stores
  // them as bare arrays. Both are the same python tuple, and only the tagged
  // form was handled -- so every course.json-backed table threw on its first
  // key. There is no ambiguity to fear: in KEY position a list cannot be a
  // value, because python has no list keys.
  if (Array.isArray(k)) return k.map(decodeKey);
  if (k === null || typeof k === 'string' || typeof k === 'number'
      || typeof k === 'boolean') {
    return k;
  }
  throw new Error(`decodeKey: unrecognised key shape ${JSON.stringify(k)}`);
}

/**
 * Decode a `{__dict__: [[key, value], ...]}` table into entries.
 *
 * THE RECORDS ARE SELF-DESCRIBING, which is what makes a native call possible:
 * a tuple-keyed python dict cannot be JSON, so it is stored tagged, and anything
 * that can read the tag can read the table. A plain object is accepted too, for
 * tables whose keys really are strings.
 */
export function decodeTable(node: unknown): Array<{ key: PyKey; value: unknown }> {
  if (node && typeof node === 'object' && '__dict__' in (node as Record<string, unknown>)) {
    const pairs = (node as { __dict__: unknown }).__dict__;
    if (!Array.isArray(pairs)) return [];
    return pairs.map((pair) => {
      const [k, v] = pair as [unknown, unknown];
      return { key: decodeKey(k), value: v };
    });
  }
  // A BARE LIST OF PAIRS is how most declarations are actually stored --
  // `[[["1c","series_box_holds"], "..."], ...]` -- and only some carry the
  // `__dict__` tag. Falling through to `[]` here made an assembler hand the
  // rule NOTHING, which then agreed with python's zero findings for entirely
  // the wrong reason. Caught because one rule's count disagreed; the others
  // would have passed silently.
  if (Array.isArray(node)) {
    return node
      .filter(row => Array.isArray(row) && row.length === 2)
      .map(row => {
        const [k, v] = row as [unknown, unknown];
        return { key: decodeKey(k), value: v };
      });
  }
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>)
      .map(([k, v]) => ({ key: k, value: v }));
  }
  return [];
}

/**
 * Decode tagged python shapes ANYWHERE in a value, not just in key position.
 *
 * `decodeKey` walks nested tags correctly and `decodeTable` applies it only to
 * KEYS -- so a tuple sitting inside a VALUE arrives as the literal
 * `{__tuple__: [...]}`. A consumer then asks `Array.isArray(...)`, gets false,
 * and reads nothing: the both-read-zero trap, where a rule agrees with python's
 * empty findings for entirely the wrong reason.
 *
 * Measured on `JOBS`: three fields of one entry decoded wrongly without this,
 * and all 26 entries compare identical with it. Five of the 31 `course.json`
 * declarations carry tagged shapes in value position.
 */
export function decodeValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeValue);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('__tuple__' in o) return ((o.__tuple__ as unknown[]) ?? []).map(decodeValue);
    // SORTED, for the reason `decodeKey` sorts a frozenset: the parts are
    // unordered, and an order-dependent comparison of an unordered thing is a
    // bug waiting for the day somebody writes them the other way round.
    if ('__frozenset__' in o) {
      return ((o.__frozenset__ as unknown[]) ?? []).map(decodeValue)
        .sort((a, b) => (String(a) < String(b) ? -1 : 1));
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = decodeValue(x);
    return out;
  }
  return v;
}
