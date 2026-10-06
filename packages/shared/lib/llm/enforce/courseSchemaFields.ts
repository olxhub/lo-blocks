// The course file's item fields and table types, against what is declared.
//
// Ported from `course_schema.part_a` and `course_schema.type_check` (goal K),
// SPLIT: `part_b` stays in python because it AST-parses engine modules to catch
// a module crossing the reader boundary, and that cannot move.
//
// WHY THIS ONE *CAN* CROSS THE JSON BOUNDARY when `same_shape` cannot. The rule
// for the rest of the worklist is that a judgement depending on PYTHON TYPE
// IDENTITY dies in transit -- a tuple arrives as a list and the distinction the
// check measures is gone. It does not apply here, and the reason is the ORIGIN
// of the data: `type_check` reads `coursedata._load()`, which IS the course
// JSON. Its values were never python literals, so `dict`/`list`/`str` are
// object/array/string and nothing is lost. The hazard is data that STARTED in
// python, not a check that happens to look at types.
//
// THE TYPE NAMES ARE PYTHON'S, and that is load-bearing for the messages: they
// read "is str, declared list". `typeof` would say "object" for an array and
// for null, so the mapping is written out rather than inferred.

export type CourseSchemaPayload = {
  /** Every field name appearing on any item, from BOTH halves of the split. */
  present: string[];
  /** group -> the field names declared in it. */
  declared: { rubric: string[]; generator: string[] };
  /** generator table name -> declared python type name, for tables present. */
  generatorTables: Array<{ name: string; declared: string; value: unknown }>;
  /** declaration name -> its value, all of which must be the list-of-pairs form. */
  declarations: Array<{ name: string; value: unknown }>;
  /** The declared type every declaration must have. */
  declarationType: string;
  /** item id + field + declared type, for optional fields that are present. */
  itemFields: Array<{ id: unknown; name: string; declared: string; value: unknown }>;
};

/** What `type(x).__name__` would say for a value that arrived as JSON. */
export function pyTypeName(v: unknown): string {
  if (v === null || v === undefined) return 'NoneType';
  if (Array.isArray(v)) return 'list';
  switch (typeof v) {
    case 'string':  return 'str';
    case 'boolean': return 'bool';
    // JSON has one number type; python prints int for a whole number. The
    // course file holds no floats in these positions, and a float that
    // appeared would read as `int` -- stated rather than silently assumed.
    case 'number':  return Number.isInteger(v) ? 'int' : 'float';
    default:        return 'dict';
  }
}

export function courseSchemaFields(p: CourseSchemaPayload): string[] {
  const out: string[] = [];
  const known = new Set([...(p?.declared?.rubric ?? []),
                         ...(p?.declared?.generator ?? [])]);
  const present = new Set(p?.present ?? []);

  // §9.2a: a field naming no group FAILS rather than defaulting.
  for (const f of [...present].filter(f => !known.has(f)).sort()) {
    out.push(
      `item field '${f}' belongs to no declared group. §9.2a: a field naming no ` +
      `group FAILS rather than defaulting -- add it to RUBRIC_FIELDS or ` +
      `GENERATOR_FIELDS, whichever the engine actually reads it through`);
  }

  for (const t of p?.generatorTables ?? []) {
    const got = pyTypeName(t.value);
    if (got !== t.declared) {
      out.push(`generator table ${t.name} is ${got}, declared ${t.declared}`);
    }
  }
  for (const d of p?.declarations ?? []) {
    const got = pyTypeName(d.value);
    if (got !== p.declarationType) {
      out.push(`declaration ${d.name} is ${got}, declared ` +
               `${p.declarationType} -- the file stores every ` +
               `declaration as [[key, value], ...]`);
    }
  }
  for (const f of p?.itemFields ?? []) {
    const got = pyTypeName(f.value);
    if (got !== f.declared) {
      const empty = !f.value || (Array.isArray(f.value) && f.value.length === 0)
                    || (typeof f.value === 'object' && f.value !== null
                        && Object.keys(f.value as object).length === 0);
      out.push(
        `item ${typeof f.id === 'string' ? `'${f.id}'` : String(f.id)} field ${f.name} is ` +
        `${got}, declared ${f.declared}` +
        (empty ? '  -- an EMPTY value is not how absence is spelled; omit the field' : ''));
    }
  }
  return out;
}

/** The STALE half of part_a. Reported separately: a violation must not hide in a tidy-up list. */
export function courseSchemaCleanups(p: CourseSchemaPayload): string[] {
  const rubric = new Set(p?.declared?.rubric ?? []);
  const known = [...rubric, ...(p?.declared?.generator ?? [])];
  const present = new Set(p?.present ?? []);
  return known.filter(f => !present.has(f)).sort().map(f =>
    `'${f}' is declared in ${rubric.has(f) ? 'RUBRIC' : 'GENERATOR'}` +
    `_FIELDS and appears on no item -- stale, not a violation`);
}
