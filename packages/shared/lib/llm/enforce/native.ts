// Running a rule from inside lo-blocks, with no python in the loop.
//
// Goal K. Every rule here is a pure function over plain JSON, so python can
// drive it — but a rule that only python can FEED is not really a lo-blocks
// test, it is a python test written in TypeScript. The user's requirement,
// 2026-09-25: *"We shouldn't create tests that can't be called by lo-blocks
// natively."*
//
// It was not hypothetical. `gold_shared_prose_has_not_drifted` shipped with
// python pre-rendering its tuple keys into `keyRepr` strings, which works
// perfectly from python and cannot be called from here at all — a native caller
// has no python to ask. The rule now reads the records AS STORED and renders
// the keys itself.
//
// SO EACH RULE GETS AN ASSEMBLER, and the pair is what "ported" means: the
// judgement, and a way to feed it that does not leave the package.
//
// AND THE GAP IS ENFORCED RATHER THAN REMEMBERED. `nativeCoverage()` reports
// any rule with neither an assembler nor a DECLARED reason it cannot have one,
// and `enforce.test.ts` fails on it. A rule added without either is a rule that
// quietly went back to needing python.

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

import { collectionDeclares, collectionDir, courseDir, courseLocation, instrumentDerived, instrumentDir, loBlocksRoot, outDir, recordPath, refuseRawDocument, rubricDerived, rubricDir, rubricFile } from './courseData';
import { corpusDataPath, resolve as resolveCorpusRefs, sha12 } from '../../../scripts/resolveCorpusRefs';
import { decodeKey, decodeTable, decodeValue, type PyKey } from './pythonRepr';
import { parseSlots, resolveOptions } from '../slotSheet';
import { ownBoxes } from './fixtureBoxes';
import { entries as checklistEntries } from './probeQuestion';
import { generatedAttrs } from '../attributeAssembler';
import { webPrompts } from '../promptAssembler';
import { parseCarried } from './carriedNotes';
import { KNOWN_VERDICTS, VERDICT_HEDGES } from './verdictVocabulary';
import {
  actionBody, actionMap, promptRemainder, readRubric, sheetTag, slotBasis,
  slotNotes, tagAttr, toRefPlaceholders,
  sheetSlots,
  stagedRubricSlots,
  rubricChoices,
} from './rubricSource';
import { SPLIT_DOCUMENTS, NO_COURSE_HALF as NO_COURSE_HALF_DECL } from './splitDocuments';
import { fileURLToPath } from 'url';
import { parseDerived } from '../slotSheet';
import { resultCell } from './resultCell';
import { eraStamp, ledger, resultValues, runsDoc, runsFiles } from './archive';
import { WEB_BY_PRIMITIVE, webCodeSha, webParts } from './webCodeSha';

/** The measured columns, in the ledger's own order. */
const SIDES = ['olx', 'paper', 'paper_opus'] as const;

/** Assembles one rule's payload from the course's own records. */
export type Assembler = (ns: string) => unknown;

/**
 * Python's `sha256(json.dumps(x, sort_keys=True, ensure_ascii=False))[:12]`.
 *
 * THE SERIALISATION HAS TO MATCH EXACTLY or every sha differs and the check
 * reports the whole corpus. Python's `json.dumps` separates with `", "` and
 * `": "`; `JSON.stringify` uses `","` and `":"`. Non-ASCII is emitted raw on
 * both sides -- `ensure_ascii=False` is what makes that true of python.
 */
function cellSha(obj: unknown): string {
  return sha12(pyJson(obj));
}

function pyJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(pyJson).join(', ')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort()
    .map(k => `${JSON.stringify(k)}: ${pyJson(o[k])}`).join(', ')}}`;
}

/**
 * The cells the fixture checks walk, with each item's OWN boxes.
 *
 * ONE BUILDER, TWO CALLERS, and they differ in exactly one respect:
 * `keepEmpty`. The disjointness check compares texts and an empty box has none;
 * the gold-agreement check asks whether a box is empty, so dropping one makes
 * it unjudgeable rather than empty. That difference is a parameter here rather
 * than two builders, because the SET and the SELECTION must not drift apart.
 *
 * THE SET IS A RECORD, not a derivation: python keeps a cell when the item's
 * own response SECTION is at least 40 characters, which is a property of the
 * segmentation. See `fixture_cells.json`.
 */
/**
 * `{item: {pid: [kind, why]}}` -- every cell that must not be COUNTED.
 *
 * THREE SOURCES, in python's order, because a later one OVERWRITES an earlier:
 * `suspect` (the whole handout's mis-transcribed participants), `exemplar_drops`
 * (this item's prompt contains their response and the grader's decision), then
 * `unscoreable` (gold withdrawn on this cell). Reading only the last of the
 * three gave `[]` where python gave `[2, 3]` on twelve items -- the handout
 * whose two participants carry byte-identical transcriptions.
 *
 * NOT A WORK LIST. Excluded cells are still RUN and still scored; only the RATE
 * excludes them.
 */
function cellExclusions(ns: string): Record<string, Record<number, [string, string]>> {
  const g = gold(ns);
  const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
  const forms = itemForms(ns);
  const suspect: Record<string, number[]> = {};
  const exemplars: Record<string, Record<string, number[]>> = {};
  for (const { key, value } of decodeTable(decl.HANDOUT_FIELDS)) {
    const fields = (decodeValue(value) ?? {}) as Record<string, unknown>;
    suspect[String(key)] = ((fields.suspect_participants ?? []) as unknown[]).map(Number);
    const ex: Record<string, number[]> = {};
    for (const row of decodeTable(fields.exemplar_items)) {
      ex[String(row.key)] = ((decodeValue(row.value) ?? []) as unknown[]).map(Number);
    }
    exemplars[String(key)] = ex;
  }
  const out: Record<string, Record<number, [string, string]>> = {};
  for (const item of Object.keys(forms)) {
    const h = String(forms[item]);
    const per: Record<number, [string, string]> = {};
    for (const pid of suspect[h] ?? []) {
      per[pid] = ['suspect', 'mis-transcribed submission; the input is not '
                             + 'what the student wrote'];
    }
    for (const pid of exemplars[h]?.[item] ?? []) {
      per[pid] = ['self_graded', "this item's prompt contains their response "
                                 + "and the grader's decision"];
    }
    out[item] = per;
  }
  for (const { key, value } of decodeTable(g.PER_ITEM_EXCLUDE)) {
    const item = String(key);
    out[item] ??= {};
    for (const row of decodeTable(value)) {
      const v = (decodeValue(row.value) ?? {}) as Record<string, unknown>;
      out[item][Number(row.key)] = ['unscoreable', String(v.why ?? '')];
    }
  }
  return out;
}

/**
 * `{item: {pid: whole text}}` for every recorded cell, joined in SORTED field
 * order -- the joins are where a 6-gram crosses a box boundary, so the order
 * decides which grams exist, and both sides sort for that reason.
 *
 * MEMOISED for the reason python memoises it: this reads 26 record files, and
 * left uncached it turned the payload-coverage test into a timeout.
 */
/**
 * Every item's FULL RUNTIME PROMPT, from the staged assembler inputs.
 *
 * Measured 2026-09-26: all 23 reproduce python's `build_web_prompt` byte for
 * byte. This is the capability that unblocked the prompt-reading checks -- they
 * were classified as needing a generator python had and the engine did not,
 * which was never true: the engine has been the designed producer since item C.
 *
 * MEMOISED, like the other record readers: the inputs are one file but the
 * assembly is not free, and several assemblers ask.
 */
const PROMPT_MEMO = new Map<string, Record<string, string>>();

function runtimePrompts(ns: string): Record<string, string> {
  const hit = PROMPT_MEMO.get(ns);
  if (hit) return hit;
  let out: Record<string, string> = {};
  try {
    const lo = loBlocksRoot();
    const inputs = readJson(join(lo ?? '.', '.stage', 'assembler-inputs.json')) as
      Record<string, any>;
    out = webPrompts(inputs);
  } catch { out = {}; }
  PROMPT_MEMO.set(ns, out);
  return out;
}

const CORPUS_MEMO = new Map<string, Record<string, Record<string, string>>>();

function corpusCells(ns: string): Record<string, Record<string, string>> {
  const hit = CORPUS_MEMO.get(ns);
  if (hit) return hit;
  const corpus: Record<string, Record<string, string>> = {};
  const dir = join(instrumentDerived(ns), 'responses');
  let names: string[] = [];
  try { names = readdirSync(dir).filter(f => f.endsWith('.json')).sort(); }
  catch { names = []; }
  for (const name of names) {
    let doc: Record<string, any>;
    try { doc = readJson(join(dir, name)) as Record<string, any>; } catch { continue; }
    const item = String(doc.item ?? name.replace(/\.json$/, ''));
    const per: Record<string, string> = {};
    for (const [pid, cell] of Object.entries(doc.cells ?? {})) {
      const boxes = (cell as any).boxes ?? {};
      per[pid] = Object.keys(boxes).sort().map(k => String(boxes[k])).join(' ');
    }
    if (Object.keys(per).length) corpus[item] = per;
  }
  CORPUS_MEMO.set(ns, corpus);
  return corpus;
}

const FIXTURE_CELL_MEMO = new Map<string, Array<{
  h: number; item: string; pid: number; boxes: Record<string, string> }>>();

function fixtureCells(
  ns: string, opts: { keepEmpty: boolean },
): Array<{ h: number; item: string; pid: number; boxes: Record<string, string> }> {
  // MEMOISED, for the reason python memoises the same thing: this reads 26
  // record files and reparses the rubric, and two assemblers ask for it. Left
  // uncached it turned the payload-coverage test into a 5-second timeout.
  const memo = `${ns}\u0000${opts.keepEmpty}`;
  const hit = FIXTURE_CELL_MEMO.get(memo);
  if (hit) return hit;
  const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
  const jobSpecs: Record<string, any> = {};
  for (const { key, value } of decodeTable(decl.JOBS)) {
    jobSpecs[String(key)] = decodeValue(value) ?? {};
  }
  const allItems = Object.keys(jobSpecs);
  let scope: Record<string, { handout: number; pids: number[] }> = {};
  try {
    const doc = readJson(join(instrumentDerived(ns), 'fixture_cells.json')) as
      Record<string, unknown>;
    scope = (doc?.items ?? {}) as typeof scope;
  } catch { return []; }

  // PYTHON'S ORDER: handout, then participant, then RUBRIC item order. The
  // findings are emitted in cell order, so a different walk produces the same
  // set in a different sequence -- which reads as a mismatch and is one, for a
  // check whose output is compared line by line.
  const rubricOrder = readRubric(rubricPath(ns)).map(i => i.id);
  const docs: Record<string, any> = {};
  for (const item of Object.keys(scope)) {
    try {
      docs[item] = readJson(join(instrumentDerived(ns), 'responses', `${item}.json`));
    } catch { /* no record for this item */ }
  }
  const handouts = [...new Set(Object.values(scope).map(s => s.handout))]
    .sort((x, y) => x - y);
  const out: Array<{ h: number; item: string; pid: number; boxes: Record<string, string> }> = [];
  for (const h of handouts) {
    const here = Object.keys(scope).filter(i => scope[i].handout === h);
    const pids = [...new Set(here.flatMap(i => scope[i].pids))]
      .sort((x, y) => x - y);
    for (const pid of pids) {
      for (const item of rubricOrder.filter(i => here.includes(i))) {
      if (!scope[item].pids.includes(pid)) continue;
      const doc = docs[item];
      if (!doc) continue;
      const spec = jobSpecs[item] ?? {};
      const cell = (doc.cells ?? {})[String(pid)];
      if (!cell) continue;
      const fixture: Record<string, string> = {};
      for (const [k, v] of Object.entries(cell.boxes ?? {})) {
        if (typeof v === 'string') fixture[k] = v;
      }
      const picked = ownBoxes(item, fixture, spec, allItems, []);
      const boxes: Record<string, string> = {};
      for (const [k, v] of Object.entries(picked)) {
        if (opts.keepEmpty || v) boxes[k] = v;
      }
      out.push({ h: scope[item].handout, item, pid, boxes });
      }
    }
  }
  FIXTURE_CELL_MEMO.set(memo, out);
  return out;
}

/**
 * What `questionFor` needs: the prompts, the sheet tags and the alias groups.
 *
 * SHARED, because two checks ask the same question of the same three inputs and
 * a second copy is how the sheet-tag selection drifts -- it already had one
 * first-match defect, which resolved a sheet-only item's slot to a NEIGHBOUR's
 * element because the two share slot names.
 */
/**
 * The columns an ENGINE-side reader can account for, from the side contract.
 *
 * `measured.web_sides()` on this side. A web column is written by the app, a
 * paper column by the rubric scorer, and the contract already says which -- so
 * the split is DERIVED, never listed. A hand-written tuple would be a second
 * statement of one fact, agreeing until somebody adds a column.
 */
function webSides(ns: string): string[] {
  const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
  const WEB_PROGRAMS = new Set(['olx_app', 'olx_python']);
  const out: string[] = [];
  for (const { key, value } of decodeTable(decl.SIDE_CONTRACT)) {
    const v = (decodeValue(value) ?? []) as unknown[];
    const prog = Array.isArray(v[0]) ? (v[0] as unknown[]).map(String) : [String(v[0])];
    if (prog.every(x => WEB_PROGRAMS.has(x))) out.push(String(key));
  }
  // NO CONTRACT IN THE RECORD IS NOT "NO WEB COLUMN". Falling through to an
  // empty list would make every item read as unrecorded and the check go
  // silent; `olx` is the column this engine writes.
  return out.length ? out.sort() : ['olx'];
}

function probeQuestionInputs(ns: string) {
  const prompts = runtimePrompts(ns);
  const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
  // the COURSE FOLDER: a course file is named relative to its own folder, not to the collection, which holds several courses
  const dir = courseLocation(ns);
  const tagById: Record<string, string> = {};
  if (dir) {
    const names = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.olx'));
    for (const stem of handoutStems(ns, names)) {
      const txt = readOrEmpty(join(dir, `${stem}.olx`));
      for (const tag of txt.match(/<(?:LLMAction|DerivedChecks)\b[^>]*>/g) ?? []) {
        const idm = /(?:^|\s)id="([^"]+)"/.exec(tag);
        if (idm) tagById[idm[1]] = tag;
      }
    }
  }
  const items = readRubric(rubricPath(ns));
  const actionOf = actionMap(items) as Record<string, unknown>;
  const sheetOnly: Record<string, string> = {};
  for (const e of (courseJson(ns).items ?? []) as Array<Record<string, unknown>>) {
    const only = e.prompt_sheet_only;
    if (typeof only === 'string' && only) sheetOnly[String(e.id)] = only;
  }
  const tags: Record<string, string> = {};
  for (const it of items) {
    const el = actionOf[it.id] ?? sheetOnly[it.id];
    if (el && tagById[String(el)]) tags[it.id] = tagById[String(el)];
  }
  const aliases: Record<string, string[]> = {};
  for (const { key, value } of decodeTable(decl.ALIAS)) {
    const group = [String(key), ...((decodeValue(value) ?? []) as unknown[]).map(String)];
    for (const n of group) {
      aliases[n] = [...new Set([...(aliases[n] ?? []), ...group])].sort();
    }
  }
  const answeredUnder: Record<string, string[]> = {};
  for (const { key, value } of decodeTable(decl.ANSWERED_UNDER)) {
    const k = (Array.isArray(key) ? key : []) as unknown[];
    if (k.length === 2) {
      answeredUnder[`${k[0]}|${k[1]}`] =
        ((decodeValue(value) ?? []) as unknown[]).map(String);
    }
  }
  return { prompts, tags, aliases, answeredUnder };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(refuseRawDocument(path), 'utf8'));
}

/**
 * A file the RUBRIC owns -- its gold, its run archive, its composed documents.
 *
 * IT WAS ONE `dataFile` OVER `courses/<ns>/`, which is neither owner. Splitting
 * it is not tidiness: `gold.json` and `CONSENSUS_SPANS.json` sat in the same
 * directory while one follows the scoring specification and the other follows
 * the handout, so a second rubric would have had to duplicate the second to get
 * its own copy of the first.
 */
export function rubricDataFile(ns: string, ...parts: string[]): string {
  return join(rubricDerived(ns), ...parts);
}

/** A file the INSTRUMENT owns, shared by every rubric that scores it. */
export function instrumentDataFile(ns: string, ...parts: string[]): string {
  return join(instrumentDerived(ns), ...parts);
}

/** `$COURSE_METADATA/<name>`, resolved per course. */
export function metadataFile(ns: string, ...parts: string[]): string {
  return join(courseDir('COURSE_METADATA', ns), ...parts);
}

/**
 * `agreement_app.JOBS` -- which screen carries each item, and which paper
 * section feeds each field. Fixtures only; no judgement about what anything is
 * worth.
 *
 * A DECLARATION, not a module. python's `_namespaced_jobs()` reads
 * `coursedata.declaration("JOBS")` and recomposes two fields the file leaves
 * out because they repeat the course id the file already carries: `ns`, and the
 * namespaced `screen`. That is a five-line transform over JSON, which is why
 * the eighteen checks that use `measured._jobs()` do not need `measured.py`
 * ported to reach it.
 *
 * VALUES ARE DECODED, and they have to be: `fallback` and `value_derived` hold
 * python tuples, which arrive tagged.
 */
export function jobs(ns: string): Record<string, Record<string, unknown>> {
  const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
  const out: Record<string, Record<string, unknown>> = {};
  for (const { key, value } of decodeTable(decl.JOBS)) {
    const spec = { ...(decodeValue(value) as Record<string, unknown>) };
    spec.ns = ns;
    const screen = spec.screen;
    if (typeof screen === 'string' && !screen.includes('/')) {
      spec.screen = `${ns}/${screen}`;
    }
    out[String(key)] = spec;
  }
  return out;
}

/**
 * The graders' MARKS: `{handout: {participant: {item: {score, feedback}}}}`.
 *
 * WHY THE ENGINE CAN SEE THESE AT ALL. They live in three `Scoring & Feedback`
 * workbooks, and reading `.xlsx` is not something a content engine should
 * learn. But gold for a course's own items is course DATA, and the workbook is
 * only where it was first written down -- so python, the sole reader of those
 * workbooks, exports them to a record (`tools/export_grader_marks.py`) and
 * everything else reads the record. One direction, one reader.
 *
 * CORRECTIONS ARE ALREADY APPLIED. `forms.config(h)["gold"]()` folds
 * `CORRECTED_GOLD` in as it reads, and the exporter calls that loader -- so
 * a corrected cell reads here with the corrected mark, not the one the
 * workbook shows. That is the view every
 * consumer wants: a correction is a considered judgement about a marking
 * error, and reading round it would re-litigate each one. The uncorrected
 * marks stay in the workbooks, and every correction is declared with its
 * reason in `gold.json`.
 */
export function goldRows(ns: string):
    Record<string, Record<string, Record<string, { score: unknown; feedback: unknown }>>> {
  const doc = readJson(rubricDataFile(ns, 'gold_rows.json')) as Record<string, unknown>;
  const h = doc?.handouts;
  if (!h || typeof h !== 'object') {
    throw new Error(
      `enforce/native: ${ns} has no gold_rows.json, so the graders' marks ` +
      `cannot be read. Run scoring/tools/export_grader_marks.py -- an empty gold table ` +
      `would make every cell look unmarked rather than unread.`);
  }
  return h as Record<string, Record<string, Record<string,
    { score: unknown; feedback: unknown }>>>;
}

export function gold(ns: string): Record<string, unknown> {
  const doc = readJson(rubricDataFile(ns, 'gold.json')) as Record<string, unknown>;
  return (doc?.declarations ?? {}) as Record<string, unknown>;
}

export function courseJson(ns: string): Record<string, unknown> {
  return readJson(metadataFile(ns, 'course.json')) as Record<string, unknown>;
}

/**
 * A ratchet ceiling from the course's records.
 *
 * FROM `budgets`, ITS OWN SECTION. These were python module constants until
 * 2026-09-25 -- `PROSE_ONLY_BUDGET = 27`, a fact about THIS course's rubric
 * sitting in the engine -- and while they lived there, four ported rules could
 * be run from python and from nowhere else: a native caller could read the
 * table but not the ceiling it is measured against.
 *
 * They are NOT in `declarations`, because the schema requires every declaration
 * to be a list of [key, value] pairs and a ceiling is a number. `course.json`'s
 * structure is meant to be identical across courses and fixed once K and L are
 * done, so a new KIND of value takes its own section rather than bending one.
 *
 * REFUSES rather than defaulting: zero is a real ceiling ("may not grow"), so a
 * missing budget must not quietly become the strictest possible rule.
 */
export function budget(ns: string, name: string): number {
  const v = (courseJson(ns).budgets ?? {}) as Record<string, unknown>;
  const got = v[name];
  if (typeof got !== 'number' || !Number.isInteger(got)) {
    throw new Error(
      `enforce/native: no budget ${name} in ${ns}'s records. A ratchet without ` +
      `its ceiling cannot be checked, and defaulting it to zero would invent a ` +
      `rule nobody declared.`);
  }
  return got;
}


/** Every `.olx` under a directory, recursively, as paths relative to it. */
function olxUnder(dir: string, prefix = ''): string[] {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...olxUnder(join(dir, e.name), rel));
    else if (e.name.endsWith('.olx')) out.push(rel);
  }
  return out;
}



/**
 * The form an item belongs to, as PYTHON TYPES IT.
 *
 * Subgoal E63. Two assemblers wrote `handout: null` while `itemForms` sat right
 * here holding the answer -- so a lo-blocks caller judged these rules with the
 * form missing, and the audit judged them with it present. Neither reported a
 * difference, because the payload was never compared until E63 built the
 * comparison. NUMERIC when the form is numeric, for the same reason
 * `rubric_items_are_unique` needed it: python's forms are ints and a string
 * makes two payloads differ while both render identically in a finding.
 */
function formOf(ns: string, id: string): number | string | null {
  const raw = itemForms(ns)[String(id)];
  if (raw === undefined) return null;
  return /^-?\d+$/.test(raw) ? Number(raw) : raw;
}

/** item id -> which form it belongs to, from the course's own records. */
function itemForms(ns: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of (courseJson(ns).items ?? []) as Array<Record<string, unknown>>) {
    out[String(it.id)] = String(it.handout);
  }
  return out;
}

/**
 * ONE handout's .olx, which is the scope python searches.
 *
 * `olx_prompts._sheet_tag(form, element)` reads `_src(form)` -- that handout
 * alone. Searching a CONCATENATED blob instead matched an earlier occurrence of
 * the same id and returned a shorter tag, so `parseSlots` saw 10 slots where
 * python saw 18 and the payload came out 21 rows short. The two parsers agree
 * exactly on identical input; the input was not identical.
 */
function handoutSrc(ns: string, form: number | string): string {
  // THE COURSE'S OWN FOLDER. A bare handout filename is joined below, and the
  // collection is the right directory for that only while the course keeps its
  // material loose in it. Python's `agreement.OLX_DIR` carried the identical
  // join and broke identically on 2026-09-26.
  const dir = courseLocation(ns) ?? '';
  try {
    const name = handoutName(ns, form);
    if (!name) return '';
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return '';
  }
}

/** Every handout .olx concatenated, as python builds the blob it scans. */
function handoutBlob(ns: string): string {
  const dir = collectionDir(ns) ?? '';
  let out = '';
  for (const rel of olxUnder(dir).sort()) {
    // BY BASENAME. `olxUnder` returns paths RELATIVE to the root it walked, so
    // a course keeping its material in a folder of its own yields
    // `bmod/bmod_handout1.olx` where it used to yield `bmod_handout1.olx`.
    // `handoutStems` matches the declared filename pattern, which has no
    // directory in it, so every handout stopped matching and the blob came
    // back EMPTY -- reported downstream as "no handout .olx text was
    // supplied", not as a bad path.
    if (!handoutStems(ns, [basename(rel)]).length) continue;
    try { out += readFileSync(join(dir, rel), 'utf8'); } catch { /* another check's */ }
  }
  return out;
}

/** The attribute names `olx_prompts.GENERATED_ATTRS` generates, in its order. */
const GENERATED_ATTRS = [
  'rubricDef', 'free', 'forbid', 'expect', 'maps', 'choices', 'counts',
  'requires', 'cover', 'equals', 'onlyif', 'max', 'slots', 'charge',
  'because', 'derived',
];


/**
 * What the SHEET offers per slot, `pick(NAME)` enums resolved.
 *
 * `enforcement._web_slot_options`, using lo-blocks' OWN `parseSlots` -- the
 * parser the scorer runs, so the answer is the shipped one rather than a second
 * reading of the same attribute.
 */
function webSlotOptions(blob: string, element: string | undefined):
    Map<string, Set<string>> | null {
  if (!element) return null;
  const tag = sheetTag(blob, element);
  if (!tag) return null;
  const spec = tagAttr(tag, 'slots') ?? '';
  // `met|absent` WHEN THE TAG DECLARES NONE, which is what python's
  // `_slots_attr` returns. Passing an empty list instead made `parseSlots` drop
  // every slot that relies on the default -- 10 keys where python reads 18, on
  // a spec that is character for character the same. The two parsers agree
  // exactly; they were being asked different questions.
  const declaredVerdicts = (tagAttr(tag, 'verdicts') ?? '').split('|').filter(Boolean);
  const defaults = declaredVerdicts.length ? declaredVerdicts : ['met', 'absent'];
  const choicesRaw = tagAttr(tag, 'choices') ?? '';
  const choices = new Map<string, string[]>();
  // `name:v1,v2|name2:v3` -- groups split on a PIPE, pairs on a COLON. Both
  // separators were wrong at first (`;` and `=`), and each error was invisible
  // in the payload SIZE: the same number of rows every time, with different
  // contents. Only comparing the findings themselves showed it, 24 then 16.
  for (const group of choicesRaw.split('|').filter(Boolean)) {
    const at = group.indexOf(':');
    if (at < 0) continue;
    const name = group.slice(0, at).trim();
    const vals = group.slice(at + 1);
    if (name) choices.set(name, vals.split(',').map(s => s.trim()).filter(Boolean));
  }
  let parsed: Array<Record<string, unknown>>;
  try {
    parsed = parseSlots(spec, defaults) as Array<Record<string, unknown>>;
  } catch {
    return null;
  }
  const out = new Map<string, Set<string>>();
  for (const s of parsed) {
    const opts = new Set<string>(['met', 'absent',
      ...((s.options as string[]) ?? [])]);
    const picks = s.picks as string | null | undefined;
    if (picks) for (const v of choices.get(picks) ?? []) opts.add(v);
    out.set(String(s.key), opts);
  }
  return out;
}

/**
 * Payload assemblers, by rule name.
 *
 * Each reads only the course's own records, through `courseDir`, so it works
 * for whichever course is named and refuses for one that is not mounted.
 */
/**
 * The documents that are SPLIT: a generic half here, a course half with the
 * rubric, and a composed copy that readers open.
 *
 * THE LIST OF RECORD IS `splitDocuments.ts`, and python reads it from there
 * through the `split_documents` probe. One value, two engines, nothing to
 * drift.
 */
const SPLIT_DOCS = SPLIT_DOCUMENTS;
const NO_COURSE_HALF_SET = new Set(Object.keys(NO_COURSE_HALF_DECL));

/** The course half: `rubrics/<rubric id>/authored/<name>`. */
function splitSpecificPath(ns: string, name: string): string {
  return join(rubricDir(ns), 'authored', name);
}

/** The composed copy every reader opens: `rubrics/<id>/derived/composed/<name>`. */
function splitComposedPath(ns: string, name: string): string {
  return join(rubricDerived(ns), 'composed', name);
}

/** The generic half, which lives beside these rules.
 *
 * `import.meta.url`, NOT `__dirname`: this package is ESM, where `__dirname`
 * simply does not exist -- the assembler threw `ReferenceError` the first time
 * a rule asked for the generic half, and the bridge reported it as a refusal
 * rather than as a finding, which is the right way round but still a defect.
 */
function splitGenericPath(name: string): string {
  return join(dirname(fileURLToPath(import.meta.url)), name);
}

/**
 * The app-code fingerprint for one (kind, item), taken HERE.
 *
 * WHICH PRIMITIVES THE ITEM AUTHORS decides which functions its answer passes
 * through, and an item whose shape cannot be read falls back to the
 * corpus-wide set -- assuming all of it, which is the conservative answer: a
 * fingerprint covering too little is one that fails to move.
 */
const SCORE_CALL_SITES = [
  'packages/shared/components/blocks/grading/SlotSheetGrader.ts',
  'packages/shared/components/blocks/grading/ScoreTable/_ScoreTable.tsx',
];

function shaFor(ns: string, kind: string, item: string): string {
  // THE ENGINE'S OWN FILES, through `loBlocksRoot` rather than named by a
  // caller -- python reached across the repo boundary for these; this side
  // does not have to.
  const lo = loBlocksRoot() ?? '';
  const src = readOrEmpty(join(lo, 'packages/shared/lib/llm/slotSheet.ts'));
  let declared: string[] | null = null;
  try {
    const acts = actionMap(readRubric(rubricPath(ns)));
    const form = String(itemForms(ns)[item] ?? '');
    const tag = sheetTag(handoutSrc(ns, form) ?? '', acts[item]) ?? '';
    declared = Object.keys(WEB_BY_PRIMITIVE)
      .filter(p => (tagAttr(tag, p) ?? '').trim());
  } catch {
    declared = null;
  }
  const payload: Parameters<typeof webCodeSha>[0] = {
    kind, names: webParts(kind, declared), slotSheet: src,
  };
  if (kind === 'score') {
    payload.callSites = SCORE_CALL_SITES.map(rel => {
      const name = rel.split('/').pop() ?? rel;
      const text = readOrEmpty(join(lo, rel));
      // A FILE THAT CANNOT BE READ CONTRIBUTES `<missing NAME>`, as python
      // does, so its absence still MOVES the fingerprint rather than being
      // silently equivalent to its presence.
      return { name, text: text || null };
    });
  }
  return webCodeSha(payload);
}

export const NATIVE: Record<string, Assembler> = {
  // THE RUBRIC IS THE ONLY SOURCE HERE. Python groups by the FORM each item
  // declares and hands over one entry per form; this reads the same rubric and
  // groups the same way, so a lo-blocks caller needs no python to run the rule.
  //
  // `byIdCount` IS THE DISTINCT-ID COUNT ON THIS SIDE, and that is not a fudge.
  // Python's `BY_ID` is a dict built from the same ITEMS list, so its size IS
  // the number of distinct ids; the check compares it against `len(set(ids))`
  // to catch an index that has silently lost or gained an entry relative to the
  // list. Reading the rubric fresh there is no separate index to disagree --
  // the arm can only fire python-side, which is where the index exists. Stated
  // rather than left as an unexplained equality.
  rubric_items_are_unique: (ns) => {
    const forms = itemForms(ns);
    const byForm = new Map<string, Array<{ id: string; slots: string[] }>>();
    for (const it of readRubric(rubricPath(ns))) {
      const f = forms[String(it.id)] ?? '?';
      if (!byForm.has(f)) byForm.set(f, []);
      byForm.get(f)!.push({
        id: String(it.id),
        slots: (it.credit ?? []).map((c) => String(c.what)),
      });
    }
    return {
      forms: [...byForm.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([form, items]) => ({
          // NUMERIC WHEN IT IS A NUMBER. Python's `_forms()` yields the form as
          // an INT and the payload carries it as one; emitting a string here
          // made the two payloads differ while both rendered "H1" in the
          // finding -- invisible in the findings, visible only in the payload
          // comparison E63 introduced. A course whose forms are named rather
          // than numbered keeps its string.
          form: /^-?\d+$/.test(form) ? Number(form) : form,
          ids: items.map((i) => i.id),
          byIdCount: new Set(items.map((i) => i.id)).size,
          credit: items,
        })),
    };
  },

  gold_shared_prose_has_not_drifted: (ns) => {
    const d = gold(ns);
    return { canonical: d._1C_GATE_CEILING, cells: d.DECLARED_CEILING_CELLS };
  },

  // THE RULE WANTS ENTRIES, not the raw tables. The first draft handed it the
  // tagged tables straight from gold.json and it THREW -- caught by running
  // every assembler through its rule and diffing against python, before it
  // shipped. An assembler is only done when the rule returns python's answer.
  no_cell_is_both_corrected_and_declared: (ns) => {
    const d = gold(ns);
    const corrected = decodeTable(d.CORRECTED_GOLD)
      .map(({ key, value }) => {
        const v = (value ?? {}) as Record<string, unknown>;
        const cell = Array.isArray(key) ? key : [String(key), ''];
        // `{item, pid}`, WHICH IS WHAT THE RULE READS. This emitted
        // `{cell: [...]}` and `goldTables` reads `c.item` and `c.pid`, so fed
        // natively every entry resolved to `undefined/undefined` and the rule
        // reported clean WHATEVER the data said. Proven by planting a cell that
        // is both corrected and declared divergent: python's shape raises the
        // finding, this one raised nothing. E63, 2026-09-25.
        return { item: String(cell[0]), pid: Number(cell[1]),
                 was: v.was ?? null, score: v.score ?? null };
      })
      .sort((a, b) => `${a.item}${a.pid}` < `${b.item}${b.pid}` ? -1 : 1);
    const divRaw = Array.isArray(d.GOLD_DIVERGENCES) ? d.GOLD_DIVERGENCES : [];
    const divergences = divRaw.map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      const cells = Array.isArray(o.cells) ? o.cells : [];
      return {
        code: o.code ?? null,
        cells: cells.map((c) => {
          const dec = decodeKey(c);
          return Array.isArray(dec) ? dec : [dec];
        }),
      };
    });
    return { corrected, divergences };
  },

  // UNDER $COURSE_DATA, not $COURSE_METADATA. The first draft reached for
  // `$COURSE_METADATA/fixture` and got ENOENT; python reads
  // `COURSE_FIXTURE_DATA`, which is `$COURSE_DATA/courses/<ns>/fixture`. Two
  // roots that both hold a `fixture` directory is exactly the confusion the
  // per-course resolution exists to end, and only running it found the error.
  consensus_fixes_have_no_duplicate_cells: (ns) => ({
    raw: readFileSync(instrumentDataFile(ns, 'fixture', 'CONSENSUS_SPANS.json'), 'utf8'),
    name: 'CONSENSUS_SPANS.json',
  }),

  // THE ITEM LIST COMES FROM `items[]`, and it was CHECKED rather than assumed:
  // python builds it as `set(ACTION) | set(SHEET_ONLY)` and the two agree
  // exactly, 26 for 26, on this course. An assembler that quietly disagreed
  // with python's idea of "this course's items" would make the rule report a
  // different set of stale fixtures from each side.
  named_fixtures_still_name_something: (ns) => {
    const cj = courseJson(ns);
    const decl = (cj.declarations ?? {}) as Record<string, unknown>;
    const items = (cj.items ?? []) as Array<{ id?: string }>;
    return {
      fixtures: decodeTable(decl.SELFTEST_NAMED_FIXTURES).map(({ key, value }) => {
        const [label, item] = Array.isArray(key) ? key : [String(key), ''];
        return { label: String(label), item: String(item), why: String(value) };
      }),
      knownItems: items.map(i => String(i.id)).sort(),
    };
  },

  prose_only_slots_are_declared: (ns) => {
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const actual: Array<[string, string]> = [];
    for (const it of readRubric(rubricPath(ns))) {
      for (const [slot, basis] of Object.entries(slotBasis(it))) {
        if (basis === 'prose+rule') actual.push([it.id, slot]);
      }
    }
    return {
      actual: actual.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1)),
      declared: decodeTable(decl.PROSE_ONLY_SLOTS).map(({ key }) =>
        (Array.isArray(key) ? key : [String(key), '']) as [string, string]),
      budget: budget(ns, 'PROSE_ONLY_BUDGET'),
    };
  },

  parked_entries_still_apply: (ns) => {
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    return {
      entries: decodeTable(decl.PARKED_UNDECLARED).map(({ key, value }) => ({
        key: Array.isArray(key) ? key : [key],
        why: String(value ?? ''),
      })),
      budget: budget(ns, 'PARKED_BUDGET'),
    };
  },

  // THE SHEET IS THE AUTHORITY on what the grader may answer, and the RUBRIC's
  // list is the fallback only when the sheet spells nothing out -- subgoal E52,
  // where reading the rubric instead let a verdict the sheet still offered go
  // unchecked for a whole sweep.
  mapped_slots_have_no_unreachable_verdict: (ns) => {
    const items = readRubric(rubricPath(ns));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const slots: unknown[] = [];
    for (const it of items) {
      if (!it.maps.length) continue;
      const web = webSlotOptions(handoutSrc(ns, forms[it.id]), action[it.id]);
      for (const m of it.maps) {
        const c = it.credit.find(x => x.what === m.key);
        if (!c) continue;
        const offered = web?.get(m.key);
        slots.push({
          item: it.id, key: m.key, pick: m.pick,
          offered: offered ? [...offered].sort() : null,
          rubricVerdicts: c.verdicts ?? [],
          emits: m.emits,
          codes: c.codes ?? {},
        });
      }
    }
    return {
      slots,
      divergences: decodeTable(decl.VERDICT_SPACE_DIVERGENCES).map(({ key }) => {
        const k = (Array.isArray(key) ? key : [[], []]) as unknown[];
        return [ [...(k[0] as string[] ?? [])].sort(),
                 [...(k[1] as string[] ?? [])].sort() ];
      }),
    };
  },

  // BOTH VERDICT SPACES: the SHEET's (authoritative on what the grader may
  // answer) and the RUBRIC's. Subgoal E52 is the reason the sheet wins --
  // reading the rubric's list let a verdict the sheet still offered go
  // unchecked for a whole sweep.
  verdict_spaces_are_declared: (ns) => {
    const items = readRubric(rubricPath(ns));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const slots: unknown[] = [];
    for (const it of items) {
      // PER FORM, as python scopes it -- see `handoutSrc`.
      const web = webSlotOptions(handoutSrc(ns, forms[it.id]), action[it.id]);
      for (const c of it.credit) {
        const offered = web?.get(c.what);
        if (!offered) continue;
        const paper = new Set<string>(['met', 'absent', ...(c.verdicts ?? []),
                                      ...Object.keys(c.codes ?? {})]);
        // AND THE COVER GROUPS THAT SPAN THIS SLOT, which python unions in.
        for (const g of it.cover ?? []) {
          if ((g.keys ?? []).includes(c.what)) for (const v of g.verdicts ?? []) paper.add(v);
        }
        slots.push({ item: it.id, what: c.what,
                     web: [...offered].sort(), paper: [...paper].sort() });
      }
    }
    return {
      slots,
      divergences: decodeTable(decl.VERDICT_SPACE_DIVERGENCES).map(({ key }) => {
        const k = (Array.isArray(key) ? key : [[], []]) as unknown[];
        return [ [...(k[0] as string[] ?? [])].sort(),
                 [...(k[1] as string[] ?? [])].sort() ];
      }),
    };
  },

  // EVERY BLOCK OF PROSE THAT REACHES A GRADER -- `leakage.authored`, rebuilt
  // here: guidance, item rules, each credit's `desc` and `rule`, the shared
  // note store, and the PROMPT REMAINDER (subgoal E54's addition, which is 637
  // of the 965 blocks and was never scanned before it existed).
  //
  // VERIFIED BLOCK FOR BLOCK: all 965 keys and all 965 texts identical to
  // python's. Getting there needed the reference placeholders restored --
  // `\0REF:id:target\0`, wrapped in NULs -- because the rendered `<Ref/>` form
  // is longer and moves the passage boundaries the labels are cut from.
  prompts_carry_no_process_history: (ns) => {
    const items = readRubric(rubricPath(ns));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const blocks: Record<string, string> = {};
    for (const it of items) {
      for (const g of it.guidance) blocks[`${it.id} guidance :: ${g.slice(0, 52)}`] = g;
      for (const r of it.rules) blocks[`${it.id} rule :: ${r.slice(0, 52)}`] = r;
      for (const c of it.credit) {
        for (const f of ['desc', 'rule'] as const) {
          const v = (c as Record<string, unknown>)[f];
          if (v) blocks[`${it.id} credit.${f} :: ${String(v).slice(0, 52)}`] = String(v);
        }
      }
    }
    for (const [k, v] of Object.entries(slotNotes(rubricPath(ns)))) {
      blocks[`SLOT_NOTES ${k}`] = v;
    }
    // AGAINST A SNAPSHOT, not the growing set: python computes every item's
    // remainder against the SAME baseline, so shared criteria prose is reported
    // once per item instead of depending on which item was processed first.
    const baseline = Object.values(blocks).join(' ');
    for (const it of items) {
      const el = action[it.id];
      if (!el) continue;
      const body = actionBody(handoutSrc(ns, forms[it.id]), el);
      if (body === null) continue;
      const own = [it.question, ...it.deductions];
      for (const [label, text] of promptRemainder(toRefPlaceholders(body), baseline, own)) {
        blocks[`${it.id} prompt :: ${label}`] = text;
      }
    }
    return { blocks: Object.entries(blocks).map(([key, text]) => ({ key, text })) };
  },

  // DESIGNED WORDING against WHAT SHIPS -- and the shipped body is read from
  // the .olx for the same reason, and with the same evidence, as
  // `no_case_names_in_prompts`: measured equivalent to the built prompt for
  // this rule across every item that has one, and still equivalent under a
  // control that corrupts a designed entry so it cannot ship.
  //
  // ONLY THE ITEMS THAT HAVE A PROMPT. Python skips an item whose prompt will
  // not build and lets the rule report it; four of the six designed entries
  // belong to items with one, and the other two are reported by the rule rather
  // than dropped here.
  every_designed_entry_ships: (ns) => {
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const items = readRubric(rubricPath(ns));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const entries = decodeTable(decl.DESIGNED_TEXT).map(({ key, value }) => {
      const [item, slot, field] = (Array.isArray(key) ? key : [String(key), '', '']) as string[];
      return { item, slot, field, want: value };
    });
    const prompts: Record<string, string> = {};
    for (const { item } of entries) {
      if (item in prompts || !action[item]) continue;
      const body = actionBody(handoutSrc(ns, forms[item]), action[item]);
      if (body !== null) prompts[item] = body;
    }
    return { entries, prompts };
  },

  // THE PROMPT AS IT SHIPS, read from the .olx, rather than rebuilt.
  //
  // Python scans `build_web_prompt(item)`. The shipped body is that same text
  // with references RENDERED -- `REF:id:target` becomes `<Ref id=... />` -- and
  // nothing else: diffed on Q1, the two differ on exactly those two lines.
  // MEASURED EQUIVALENT for this rule: both forms give the same findings across
  // all 23 items, and still agree under a control that injects `p10`.
  //
  // WHERE IT WOULD STOP BEING EQUIVALENT, and it is worth naming rather than
  // trusting: the rule looks for `p<digits>`, and a reference ID containing one
  // would appear in the shipped form and not the built one. No id does today.
  no_case_names_in_prompts: (ns) => {
    const items = readRubric(rubricPath(ns));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const prompts: unknown[] = [];
    for (const item of Object.keys(action).sort()) {
      const body = actionBody(handoutSrc(ns, forms[item]), action[item]);
      if (body !== null) prompts.push({ item, text: body });
    }
    return { prompts };
  },

  // ALL THE RATCHETS AT ONCE, which is the one place a native payload is
  // deliberately SHAPED DIFFERENTLY from python's. `ratchets_only_tighten` is
  // shared: python calls it once per check, each with a single ratchet, so no
  // single python call carries them all. Natively there is no reason to ask
  // three times, and the rule already accepts a list. The answer is therefore
  // the UNION of python's separate calls, and that is what it is verified
  // against -- not against any one of them.
  ratchets_only_tighten: (ns) => {
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const count = (v: unknown) =>
      Array.isArray(v) ? v.length : decodeTable(v).length;
    return {
      ratchets: [
        {
          table: 'SLOT_RULE_BACKLOG', budgetName: 'SLOT_RULE_BACKLOG_BUDGET',
          count: count(decl.SLOT_RULE_BACKLOG),
          budget: budget(ns, 'SLOT_RULE_BACKLOG_BUDGET'),
          unit: 'olx-only slot rule',
          advice: 'Put the text in the credit component\'s `rule` field, which ' +
                  'both generators render, rather than in SLOT_NOTES, which the ' +
                  'paper scorer never sees',
        },
        {
          table: 'HANDCODED_ITEM_RULES', budgetName: 'HANDCODED_BUDGET',
          count: count(decl.HANDCODED_ITEM_RULES),
          budget: budget(ns, 'HANDCODED_BUDGET'),
          unit: 'hand-coded rule',
          advice: 'A declaration is a promise to convert it, not a licence to ' +
                  'keep it: convert the rule, or lower the budget only when one ' +
                  'goes',
        },
      ],
    };
  },

  // THE ITEM->ELEMENT MAP COMES FROM THE RUBRIC (`asks=`), and the blob is
  // every handout .olx concatenated, which is what python hands the rule.
  every_item_has_a_findable_slot_sheet: (ns) => {
    const items = readRubric(rubricPath(ns));
    const want = actionMap(items);
    // SHEET_ONLY IS A PER-ITEM FIELD, not a generator table: the export omits
    // `prompt_sheet_only` on the 23 items that lack it rather than storing
    // null. Reading it as a table found NOTHING and left the payload at 23
    // sheets against python's 26 -- the same findings, three fewer items
    // checked, which is the under-coverage this comparison exists to catch.
    for (const it of (courseJson(ns).items ?? []) as Array<Record<string, unknown>>) {
      const only = it.prompt_sheet_only;
      if (typeof only === 'string' && only) want[String(it.id)] = only;
    }
    return {
      sheets: Object.keys(want).sort().map(i => ({ item: i, elementId: want[i] })),
      olx: handoutBlob(ns),
    };
  },

  // `present` NEEDS THE SHIPPED SHEET, which is why this was blocked: the
  // declaration alone says an attribute is exempt, not whether it is THERE.
  // `sheetTag` reads it the way python does, with python's own regex.
  hand_authored_attrs_still_suppress_something: (ns) => {
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const items = readRubric(rubricPath(ns));
    const action = actionMap(items);
    const blob = handoutBlob(ns);
    const entries: unknown[] = [];
    for (const { key, value } of decodeTable(decl.HAND_AUTHORED_ATTRS)) {
      const [item, name] = (Array.isArray(key) ? key : [String(key), '']) as [string, string];
      const el = action[item];
      const tag = el ? sheetTag(blob, el) : null;
      if (el && !tag) continue;            // a missing sheet is another check's
      const v = tag ? tagAttr(tag, name) : null;
      entries.push({
        item, name, why: String(value),
        isGenerated: GENERATED_ATTRS.includes(name),
        present: !!(v && v.trim()),
      });
    }
    return { entries };
  },

  // THE LEDGER NAMES THE RECORDED COLUMNS, and the artifact path is derived
  // from each column's `out`. A PENDING column, or one with no numerator, is
  // skipped exactly as python skips it: it has not been measured, so there is
  // no artifact to find and its absence means nothing.
  recorded_sides_are_readable: (ns) => {
    const ledger = readJson(metadataFile(ns, 'MEASURED.json')) as
      Record<string, Record<string, Record<string, Record<string, unknown>>>>;
    const out = courseDir('COURSE_DATA', ns);
    const sides: unknown[] = [];
    for (const item of Object.keys(ledger.items ?? {}).sort()) {
      for (const side of SIDES) {
        const e = (ledger.items[item] ?? {})[side];
        if (!e || e.pending || e.numerator === null || e.numerator === undefined) continue;
        sides.push({
          item, side, numerator: e.numerator, denominator: e.denominator,
          out: String(e.out),
          path: relative(out, join(outDir(ns), String(e.out), `${item}.runs.json`)),
        });
      }
    }
    return { sides, ns };
  },

  // THE SAME LEDGER, but only the columns whose artifact EXISTS: python asks
  // `os.path.exists` before adding one, because a column naming a file that is
  // not there is the OTHER check's finding, not this one's.
  // THE RECORDED RUNS THEMSELVES, not just their paths. The sibling rule
  // `no_recorded_run_is_verdictless` sends paths because python re-reads them;
  // this one needs the feedback text, so the assembler carries it.

  // THE TWO DECLARATIONS THIS PAIRS. `cited_participants` lives in the handout
  // fields, `CITATION_NECESSITY` in the course declarations; both are read here
  // so the rule compares two tables rather than a table against a memory.
  // THE COMPOSED LEDGER AND THE PROSE-ONLY TABLE. The ledger is the composed
  // copy, not the generic half: a subgoal naming a slot is course work, and
  // course work lives in the course half.
  convertible_prose_rules_have_subgoals: (ns) => {
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const slots: Array<{ item: string; slot: string; why: string }> = [];
    for (const { key, value } of decodeTable(decl.PROSE_ONLY_SLOTS)) {
      const pair = Array.isArray(key) ? key : [key, ''];
      slots.push({ item: String(pair[0]), slot: String(pair[1]),
                   why: String(decodeValue(value) ?? '') });
    }
    slots.sort((a, b) => (a.item + '\u0000' + a.slot).localeCompare(b.item + '\u0000' + b.slot));
    const path = splitComposedPath(ns, 'GOALS.md');
    let goalsText: string | null = null;
    let goalsError: string | null = null;
    try { goalsText = readFileSync(path, 'utf8'); }
    catch (e) { goalsError = (e as Error)?.message ?? String(e); }
    return { goalsText, goalsError, slots };
  },

  citation_necessity_is_recorded: (ns) => {
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const handouts: Record<string, Record<string, number[]>> = {};
    for (const { key, value } of decodeTable(decl.HANDOUT_FIELDS)) {
      const spec = (decodeValue(value) ?? {}) as Record<string, unknown>;
      const cited = (spec.cited_participants ?? {}) as Record<string, unknown>;
      const per: Record<string, number[]> = {};
      for (const [item, pids] of Object.entries(cited)) {
        per[item] = (Array.isArray(pids) ? pids : []).map(Number);
      }
      handouts[String(key)] = per;
    }
    const necessity: Record<string, string> = {};
    for (const { key, value } of decodeTable(decl.CITATION_NECESSITY)) {
      // PYTHON KEYS IT `(item, pid)`; the bridge renders a tuple key as the
      // pair, so it is flattened to `item/pid` on both sides of this rule.
      const k = Array.isArray(key) ? `${key[0]}/${key[1]}` : String(key);
      necessity[k] = String(decodeValue(value) ?? '');
    }
    return { handouts, necessity };
  },

  no_recorded_run_is_an_api_error: (ns) => {
    const ledger = readJson(metadataFile(ns, 'MEASURED.json')) as
      Record<string, Record<string, Record<string, Record<string, unknown>>>>;
    const artifacts: unknown[] = [];
    for (const item of Object.keys(ledger.items ?? {}).sort()) {
      for (const side of SIDES) {
        const e = (ledger.items[item] ?? {})[side];
        if (!e) continue;
        const abs = join(outDir(ns), String(e.out), `${item}.runs.json`);
        if (!existsSync(abs)) continue;
        type RunDoc = { runs?: Array<{ results?: Array<Record<string, unknown>> }> };
        let doc: RunDoc | null = null;
        try { doc = readJson(abs) as RunDoc; } catch { continue; }
        const runs = (doc?.runs ?? []).map(run => ({
          // THROUGH `resultCell`, which is where the app's fractional score is
          // multiplied back to points. Reading `score` directly gave `None` for
          // every app result and `pnull` for every participant.
          results: (run.results ?? []).map(r => {
            const c = resultCell(r);
            return { pid: c?.pid ?? null, score: c?.points ?? null,
                     feedback: String(r.feedback ?? '') };
          }),
        }));
        artifacts.push({ item, side, runs });
      }
    }
    return { artifacts };
  },

  no_recorded_run_is_verdictless: (ns) => {
    const ledger = readJson(metadataFile(ns, 'MEASURED.json')) as
      Record<string, Record<string, Record<string, Record<string, unknown>>>>;
    const root = courseDir('COURSE_DATA', ns);
    const arts: unknown[] = [];
    for (const item of Object.keys(ledger.items ?? {}).sort()) {
      for (const side of SIDES) {
        const e = (ledger.items[item] ?? {})[side];
        if (!e || e.pending || e.numerator === null || e.numerator === undefined) continue;
        const abs = join(outDir(ns), String(e.out), `${item}.runs.json`);
        if (!existsSync(abs)) continue;
        arts.push({ item, side, path: relative(root, abs) });
      }
    }
    return { artifacts: arts, ns };
  },

  // EVERY .olx UNDER THE COURSE'S CONTENT, through the mount. An unreadable
  // file becomes an `error` entry rather than being skipped: whether its
  // references resolve is then UNKNOWN, which is a different answer from fine.
  every_reference_has_the_data_that_resolves_it: (ns) => {
    // THROUGH THE SYMLINK, because `root` is QUOTED in the finding this rule
    // raises when a scan covers nothing. `content/<ns>` is a symlink to the
    // course, so the mount path and the course path name the same directory and
    // read the same files -- but they are different STRINGS, and python reports
    // the course path. Resolving keeps the two sides' messages identical.
    const dir = realpathSync(collectionDir(ns) ?? '');
    // RECURSIVELY, because python uses `rglob`. A flat listing found 25 of the
    // 32 .olx here and reported the same ZERO findings, so the two sides agreed
    // while one of them had quietly checked seven fewer files -- including a
    // whole `defiance/` subdirectory. Matching findings is not matching
    // COVERAGE, and only comparing the payload sizes against python showed it.
    const names = olxUnder(dir).sort();
    return {
      root: dir,
      files: names.map((rel) => {
        // LABELLED BY THE COLLECTION'S OWN NAME, read off the directory rather
        // than written here -- python reports the path relative to the course
        // repository, so the label has to be whatever that directory is called.
        const where = `${basename(dir)}/${rel}`;
        try {
          return { path: where, text: readFileSync(join(dir, rel), 'utf8') };
        } catch (e) {
          return { path: where, error: (e as Error).message };
        }
      }),
    };
  },

  // THE PATHS COME FROM `JOBS`, which is where python reads them: a job that
  // declares a hand-split fixture names the file. A path that is absent on this
  // machine is SKIPPED, as python skips it -- the corpus is not always mounted
  // -- but one that is present and unreadable is reported.
  handsplit_rows_are_disjoint: (ns) => {
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const tables: unknown[] = [];
    for (const { value } of decodeTable(decl.JOBS)) {
      const spec = (value ?? {}) as Record<string, unknown>;
      const declared = spec.handsplit;
      if (typeof declared !== 'string' || !declared) continue;
      // A ROOT TOKEN, resolved here -- the record names the owner, not the disk.
      const path = recordPath(declared, ns);
      const name = path.split('/').pop() ?? path;
      let doc: unknown;
      try {
        doc = JSON.parse(readFileSync(path, 'utf8'));
      } catch (e) {
        const msg = (e as NodeJS.ErrnoException);
        if (msg.code === 'ENOENT') continue;          // absent corpus, as python
        tables.push({ name, error: msg.message });
        continue;
      }
      const rows = Object.entries(doc as Record<string, unknown>)
        .filter(([, row]) => row && typeof row === 'object' && !Array.isArray(row))
        .map(([pid, fields]) => ({ pid, fields: fields as Record<string, unknown> }));
      tables.push({ name, rows });
    }
    return { tables };
  },

  // THE SPANS FILE, WITH ITS VERBS MAPPED AS PYTHON MAPS THEM. The file says
  // `slice`, `slice_ws`, `clear` or `join`; `_ConsensusFixes` RESOLVES every one
  // of them against the corpus and hands the rule a `set`. Measured on this
  // course: 91 + 1 + 9 + 1 = 102 file entries, 102 `set`s after resolution, so
  // the mapping is total. The rule names the verb in its finding, so passing
  // the raw verb would make native and python disagree the moment one fires.
  //
  // A `swap` passes through untouched, because it names TWO boxes and the rule
  // reads both -- collapsing it would hide a swap clobbering a box.
  consensus_fixes_are_unique: (ns) => {
    const raw = readJson(instrumentDataFile(ns, 'fixture', 'CONSENSUS_SPANS.json')) as
      Record<string, unknown[][]>;
    const entries = Object.entries(raw)
      .map(([cell, fixes]) => {
        const [item, pid] = cell.split('/');
        return {
          item, pid: Number(String(pid).replace(/^p/, '')),
          fixes: (fixes ?? []).map(f =>
            f[0] === 'swap' ? f : ['set', f[1]]),
        };
      })
      .sort((a, b) => (a.item + String(a.pid).padStart(3, '0') <
                       b.item + String(b.pid).padStart(3, '0') ? -1 : 1));
    return { entries };
  },

  // MAPS COME FROM THE RUBRIC, and `inSpec`/`attached` are the same question
  // asked twice: does the item exist, and does its spec carry the maps table.
  // THE BLOCKER ON THIS ONE WENT STALE. `NATIVE_BLOCKED` said porting it would
  // make a THIRD copy of the verdict vocabulary -- true when written, and no
  // longer: goal K made `verdictVocabulary.ts` the single source and taught
  // `slot_vocab` to READ it, so the vocabulary is already here and python is
  // the copy. Everything else it needs was here too: `parseSlots` for the
  // sheet's `slots=`, `readRubric` for credit and cover, `slotNotes` for the
  // per-slot prose.
  //
  // `offered` IS NOT `webSlotOptions`. That helper forces `met` and `absent`
  // into every slot, which is right for the callers it serves and wrong here:
  // python's `offered` is the slot's own options plus its pick's choices, and
  // forcing the defaults in would hide a slot that offers neither.
  prompt_prose_names_only_offered_verdicts: (ns) => {
    const items = readRubric(rubricPath(ns));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const notes = slotNotes(rubricPath(ns));
    const slots: Array<Record<string, unknown>> = [];
    for (const it of items) {
      const element = action[it.id];
      if (!element) continue;
      const blob = handoutSrc(ns, forms[it.id]);
      const tag = sheetTag(blob, element);
      if (!tag) continue;
      const declared = (tagAttr(tag, 'verdicts') ?? '').split('|').filter(Boolean);
      const defaults = declared.length ? declared : ['met', 'absent'];
      const choices = new Map<string, string[]>();
      for (const group of (tagAttr(tag, 'choices') ?? '').split('|').filter(Boolean)) {
        const at = group.indexOf(':');
        if (at < 0) continue;
        const name = group.slice(0, at).trim();
        if (name) {
          choices.set(name, group.slice(at + 1).split(',')
            .map(s => s.trim()).filter(Boolean));
        }
      }
      let parsed: Array<Record<string, unknown>>;
      try { parsed = parseSlots(tagAttr(tag, 'slots') ?? '', defaults) as Array<Record<string, unknown>>; }
      catch { continue; }
      const credit = it.credit ?? [];
      const withRule = new Set(credit.filter(c => c.rule).map(c => String(c.what)));
      for (const s of parsed) {
        const key = String(s.key);
        const offered = new Set<string>((s.options as string[]) ?? []);
        const picks = s.picks as string | null | undefined;
        if (picks) for (const v of choices.get(picks) ?? []) offered.add(v);
        const comp = credit.find(c => String(c.what) === key);
        const paper = new Set<string>(['met', 'absent',
          ...((comp?.verdicts as string[]) ?? []),
          ...Object.keys((comp?.codes as Record<string, string>) ?? {})]);
        for (const grp of it.cover ?? []) {
          if ((grp.keys ?? []).includes(key)) for (const v of grp.verdicts ?? []) paper.add(v);
        }
        slots.push({
          item: it.id, key, hasRule: withRule.has(key),
          offered: [...offered].sort(), offeredPaper: [...paper].sort(),
          note: notes[`${it.id}:${key}`] ?? notes[key] ?? null,
          desc: comp?.desc ?? null,
        });
      }
    }
    return { knownVerdicts: [...KNOWN_VERDICTS], slots };
  },

  // EVERY INPUT IS NOW REACHABLE FROM HERE, which is what unblocked it. The
  // blocker said "the rubric carries the parts; nothing in TS assembles them" --
  // a statement about effort, and only two thirds true. The FAMILIES derive
  // from the rubric's `<Item family=...>`, which `readRubric` already exposes;
  // the BUDGET is in `course.json`. The DIVERGENCES were a python literal, and
  // that was the real block: E63 moved them to the course file so both sides
  // read one source.
  //
  // THE SHAPES COME FROM THE SHEET, NOT A RUN. `!key` gates, `@n` carries the
  // threshold -- the same two marks python reads off `slots=`, and read from
  // the OLX for the reason python gives: a structural check should not need a
  // sweep to have happened.
  sibling_slots_share_their_structure: (ns) => {
    const items = readRubric(rubricPath(ns));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const fams = new Map<string, Map<string, Record<string, { gates: boolean; at: number | null }>>>();
    for (const it of items) {
      const family = it.family;
      if (!family) continue;
      const element = action[it.id];
      if (!element) continue;
      const tag = sheetTag(handoutSrc(ns, forms[it.id]), element);
      if (!tag) continue;
      for (const part of (tagAttr(tag, 'slots') ?? '').split('|')) {
        const head = part.split(':')[0].trim();
        if (!head) continue;
        const gates = head.startsWith('!');
        const key = head.replace(/^!+/, '');
        const at = /@([0-9.]+)/.exec(part);
        if (!fams.has(family)) fams.set(family, new Map());
        const byslot = fams.get(family)!;
        if (!byslot.has(key)) byslot.set(key, {});
        byslot.get(key)![it.id] = { gates, at: at ? Number(at[1]) : null };
      }
    }
    const families: Array<Record<string, unknown>> = [];
    for (const [family, byslot] of fams) {
      for (const [slot, perItem] of byslot) families.push({ family, slot, perItem });
    }
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const divergences = decodeTable(decl.SLOT_STRUCTURE_DIVERGENCES)
      .map(({ key }) => (Array.isArray(key) ? key.map(String) : [String(key)]));
    return { families, divergences, budget: budget(ns, 'SLOT_STRUCTURE_BUDGET') };
  },

  // FROM THE RUBRIC, which is where these facts live. `course.json`'s `items`
  // carry only the prompt fields; `derive_from_credit`, `blank_code`,
  // `unreachable_codes` and the deductions WITH POINTS are attributes on the
  // rubric's `<Item>` and `<Deduction>` elements. `readRubric` was not
  // surfacing them and now does.
  //
  // CAUGHT BY THE PAYLOAD, NOT THE FINDINGS. Two earlier drafts produced 26
  // items of which ZERO were credit-derived -- so the rule checked nothing and
  // returned clean, agreeing with python for entirely the wrong reason. The
  // findings matched both times; only counting what the payload CONTAINED
  // showed it.
  codes_reachable: (ns) => ({
    items: readRubric(rubricPath(ns)).map(it => ({
      id: it.id,
      deriveFromCredit: Boolean(it.deriveFromCredit),
      blankCode: it.blankCode ?? null,
      unreachableCodes: it.unreachableCodes ?? [],
      credit: (it.credit ?? []).map(c => ({ codes: c.codes ?? {} })),
      deductions: it.charges ?? [],
    })),
  }),

  // `counted` IS ALREADY WHAT PYTHON BUILDS. `readRubric` collects the keys any
  // `Counts` group covers, which is python's
  // `{k for cr in it["counts"] for k in cr["slots"]}` -- the same set by a
  // different route, so no counts parsing is repeated here.
  countable_families_converted: (ns) => ({
    items: readRubric(rubricPath(ns)).map(it => ({
      id: it.id,
      deriveFromCredit: Boolean(it.deriveFromCredit),
      // SLOTS ONLY, which is python's set: `readRubric.counted` folds in each
      // group's own key and python's comprehension does not.
      counted: (it.counted ?? []).filter(k => !(it.countKeys ?? []).includes(k)),
      credit: (it.credit ?? []).map(c => ({ what: c.what, codes: c.codes ?? {} })),
    })),
    exempt: decodeTable(((courseJson(ns).declarations ?? {}) as Record<string, unknown>)
      .COUNTABLE_EXEMPT).map(({ key }) =>
        (Array.isArray(key) ? key.map(String) : [String(key), '']) as [string, string]),
  }),

  // FROM THE GOLD FILE, where `PER_ITEM_EXCLUDE` is a declaration. An entry is
  // either a bare reason string or `{why, expect_error}`; only the second can
  // be checked, which is the whole distinction this rule draws.
  exclusion_claims_are_data: (ns) => ({
    cells: decodeTable(gold(ns).PER_ITEM_EXCLUDE).flatMap(({ key, value }) => {
      const item = String(Array.isArray(key) ? key[0] : key);
      return decodeTable(value).map(({ key: pid, value: entry }) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        const isObj = e && typeof e === 'object' && !Array.isArray(e);
        return {
          item, pid: Number(pid),
          why: String(isObj ? (e.why ?? '') : entry),
          declared: Boolean(isObj && e.expect_error !== undefined && e.expect_error !== null),
        };
      });
    }),
  }),

  // THE NAMES COME FROM THE COLLECTION, not from this file. `course_olx`,
  // `rubric_component` and `handout_olx` are manifest keys now; python read the
  // same three and defaulted to one course's filenames when they were absent.
  the_course_links_the_rubric_and_every_form: (ns) => {
    // the COURSE FOLDER: a course file is named relative to its own folder, not to the collection, which holds several courses
    const dir = courseLocation(ns) ?? '';
    const courseOlx = collectionDeclares(ns, 'course_olx') ?? '';
    const rubric = collectionDeclares(ns, 'rubric_component') ?? '';
    const pattern = collectionDeclares(ns, 'handout_olx') ?? '';
    const stem = (f: string) => f.replace(/\.olx$/, '');
    const forms = [...new Set(Object.values(itemForms(ns)))]
      .filter(Boolean).sort((a, b) => Number(a) - Number(b));
    const want = [stem(rubric), ...forms.map(f => stem(pattern.replace('%d', String(f))))];
    const full = join(dir, courseOlx);
    if (!existsSync(full)) {
      return { courseOlx, exists: false, relPath: join(basename(dir), courseOlx), refs: [], want };
    }
    const text = readFileSync(full, 'utf8');
    const refs = [...text.matchAll(/<Use\s+ref="([^"]+)"/g)].map(m => m[1]);
    return { courseOlx, exists: true, relPath: join(basename(dir), courseOlx), refs, want };
  },

  // ITEM POINTS FROM THE RUBRIC, corrections from the gold file. `max` is an
  // `<Item>` attribute and the per-slot `pts`/`reported`/`gates` are on the
  // credit components, so the attainable grid is computed from the same numbers
  // python computes it from.
  // THE RAW EXPANDED FILE on one side, the recorded counts on the other. Both
  // are read here rather than in the rule so the rule stays a comparison of two
  // counts and has no idea what a rubric is.
  // THE SHEET COMES FROM THE RUBRIC, not from the handout's `slots=` attribute.
  // They reproduce each other clause for clause -- the element is the source and
  // the attribute the projection -- but python reads `SLOT_SPEC`, which is
  // `as_view_slots`, and reading the projection instead would be a second
  // reading of the same thing with nothing checking the two agree.
  // THE FILESYSTEM WALK LIVES HERE and the judgement lives in the rule, which
  // is the split that lets a caller inside lo-blocks run this at build time --
  // it reads lo-blocks' OWN artefacts, so python was never the natural place
  // for it.
  no_unresolved_reference_reaches_the_page: (ns) => {
    const lo = loBlocksRoot();
    if (!lo) {
      return { loExists: false, loPath: '', newestSrc: 0, olxDirName: '',
               missingFromStage: [], stageHasNames: false, roots: [] };
    }
    // THE COURSE'S OWN FOLDER: `builtPagePayload` lists the `.olx` sitting
    // directly in the directory it is handed, so the collection gave it the
    // OTHER courses' files and none of this one's.
    return builtPagePayload(lo, courseLocation(ns) ?? '', ns);
  },

  slot_codes_exist: (ns) => {
    const sheet = sheetSlots(expandedRubricPath(ns));
    return {
      items: readRubric(rubricPath(ns)).map(it => ({
        id: it.id,
        // THE CODES, NOT THE PROSE. `it.deductions` here is the deduction TEXT;
        // python's `deductions` are dicts and this reads their `code`, which is
        // what `charges` carries on this side.
        deductions: (it.charges ?? []).map(c => c.code),
        credit: (it.credit ?? []).map(c => ({ what: c.what, codes: c.codes ?? null })),
        blankCode: it.blankCode ?? null,
        counts: it.counts ?? [],
        onlyif: it.onlyif ?? [],
        sheet: (sheet[it.id] ?? []).map(s => s.key),
      })),
    };
  },

  // THE POPULATION IS `JOBS`, as python's `sorted(M._jobs())` is -- the items
  // this course actually measures, not every item in the rubric. The primitives
  // come from the rubric itself.
  //
  // `counts` IS A WRITER TOO. python's COMPUTED tuple lists it alongside
  // equals/expect/forbid/maps/derived, and `kinds` does not carry it: a
  // `<Counts>` group's own `key` is the slot it writes. Leaving it out would
  // miss exactly the collision the check exists to find.
  // `resolveOptions` IS LO-BLOCKS' OWN. python's `olx_prompts.resolve_options`
  // says so in its docstring -- "Mirror of slotSheet.ts:resolveOptions" -- so
  // the assembler asks the original rather than a copy of it.
  // BOTH TABLES ARE DECLARATIONS, keyed by shapes only `decodeKey` reads:
  // `VERDICT_SPACE_DIVERGENCES` by a PAIR OF FROZENSETS, `UNCHARGED_VERDICTS`
  // by an (item, slot, verdict) tuple.
  // `parseChoices` AND `parsePick` ARE LO-BLOCKS' OWN -- python's
  // `olx_prompts.parse_choices`/`pick_set` say so in their docstrings ("Mirror
  // of slotSheet.ts"). The assembler asks the originals.
  //
  // THE `SLOT_OPTIONS` GATE IS REPRODUCED: python returns the rubric's choices
  // table only for a handout that CARRIES A CADENCE ITEM, and `{}` elsewhere,
  // so a slot on another handout has no rubric source and is preserved rather
  // than reported.
  // THE FORMS IN ORDER, as python's `_forms()` yields them. `handoutSrc`
  // returns '' when the file cannot be read, which is NOT the same as an empty
  // handout -- null carries "unreadable" through to the rule.
  // `ACTION` PLUS `SHEET_ONLY`, which is python's `{**ACTION, **SHEET_ONLY}`:
  // three items of twenty-six are scored from a sheet with no `<LLMAction>` at
  // all, and omitting them would skip exactly the items whose slot list has no
  // prompt to cross-check it.
  // THE RAW `slots=` SPLIT, not `parseSlots`. python reads the key as
  // `s.split(":")[0].lstrip("!")` here and through the parser in E48 -- the two
  // agree on this corpus, and reproducing each one where it is used keeps that
  // an observation rather than an assumption.
  // NAMED RELATIVE TO THE COLLECTION, not to the caller's working directory.
  // python renders this with `os.path.relpath`, which is relative to whatever
  // CWD the audit was started from -- so its own output is not a stable string
  // and cannot be a specification. A DECLARED DIVERGENCE, and a narrow one: it
  // reaches only the two arms that name a MISSING or templated file, both of
  // which are unreachable in a tree that builds at all. The byte comparison
  // that the check exists for is identical.
  // `webSlotOptions` ALREADY LIVES HERE -- it is `enforcement._web_slot_options`
  // using lo-blocks' OWN `parseSlots`, so the answer is the shipped one rather
  // than a second reading of the same attribute. NULL MEANS UNREADABLE, not
  // "offers nothing", and does not convict.
  // THE TABLES ARE GENERATOR FIELDS ON `course.json`'s ITEMS, the same place
  // `prompt_sheet_only` lives -- `_generator_table(field)` reads exactly this.
  // `OMIT_CREDIT` and `OMIT_DEDUCTION` have no field: python declares them as
  // empty literals, so they are empty here too and their arms are inert until
  // somebody authors one.
  // SORTED BY HANDOUT, THEN PARTICIPANT, THEN ITEM -- python's three nested
  // `sorted()` calls, and therefore the order of the findings. `pid` stays a
  // STRING: python sorts the participant keys as the gold loader yields them,
  // and re-sorting them numerically here would reorder the findings.
  // THE RAW TEXT, not the parsed document: `JSON.parse` has already discarded
  // one of two same-named keys by the time anything can look.
  // `score_raw` -- THE UNCORRECTED MARK. Comparing a correction's `was` to the
  // corrected value would report a mismatch on all fifteen, because that value
  // is what the correction produced.
  // TABLES IN RECORD ORDER. python walks `rubric_export.DECLARATION_TABLES`,
  // and `course.json`'s declaration keys are that list minus the two it does
  // not carry -- IN THE SAME ORDER, checked rather than assumed. The two it
  // skips are the two python skips too, because `coursedata.declaration` raises
  // on them. Table order decides finding order, so this is not cosmetic.
  // THE REGISTRIES COME FROM THE RECORD. `HANDOUT_FIELDS` in `course.json`
  // carries `cited_participants` and `exemplar_participants` per handout --
  // participant numbers are student data and do not belong in either engine's
  // code. `forms.py` held a shadow copy of them until 2026-09-26.
  // EVERY TABLE THAT CARRIES A `why`, in python's order: the two `forms`
  // tables then the three `measured` ones. All five are declarations in
  // `gold.json`, and `suspect` comes from `HANDOUT_FIELDS` -- participant
  // numbers are student data and live in the record.
  // BOTH HALVES FROM THE RECORD AND THE RUBRIC: `DESIGNED_TEXT` is a course
  // declaration, and the shipped wording is the rubric's own attribute. The
  // whole point is that no third copy stands between them.
  shipped_text_matches_design: (ns) => {
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const designed: Array<Record<string, unknown>> = [];
    for (const { key, value } of decodeTable(decl.DESIGNED_TEXT)) {
      const k = (Array.isArray(key) ? key : [String(key), '', '']) as unknown[];
      designed.push({ item: String(k[0]), slot: String(k[1]), field: String(k[2]),
                      want: String(value ?? '') });
    }
    const credit: Record<string, unknown[]> = {};
    for (const it of readRubric(rubricPath(ns))) {
      if (it.id in credit) continue;     // python takes the FIRST form that has it
      credit[it.id] = (it.credit ?? []).map(c => ({ what: c.what, attrs: c.attrs }));
    }
    return { designed, credit };
  },

  // THE MANDATORY DESIGN TIER. `want` is the file of record under
  // $COURSE_METADATA; `live` is hashed from the rubric the graders actually
  // read, so nothing stands between the two.
  every_prompt_field_is_designed: (ns) => {
    const file = 'DESIGNED_TEXT_SHA.json';
    let want: Record<string, string> = {};
    try {
      const raw = readJson(metadataFile(ns, file)) as Record<string, unknown>;
      want = (raw?.fields ?? {}) as Record<string, string>;
    } catch { want = {}; }

    // RESOLVED BEFORE HASHING. Since the history rewrite a field that quotes a
    // student holds `{{corpus:...}}` where the registered design held the
    // sentence, so hashing the raw text reports CHANGED on every such field
    // with not a word altered -- and ACCEPTING one would bake the reference
    // itself in as the design, after which a later wording edit inside it
    // would move no sha at all. Hash what the text MEANS.
    const olxPath = rubricPath(ns);
    const olx = readOrEmpty(olxPath);
    let data: Record<string, string> = {};
    try {
      const dp = corpusDataPath(olx);
      if (dp) data = readJson(dp) as Record<string, string>;
    } catch { data = {}; }
    const fieldSha = (text: string): string => {
      let t = String(text);
      if (t.includes('{{corpus:')) {
        // NO EXPORT CONFIGURED MEANS HASH IT RAW, exactly as python falls back.
        try { t = resolveCorpusRefs(t, data, olxPath); } catch { /* raw */ }
      }
      return sha12(t.replace(/\s+/g, ' ').trim());
    };

    const live: Record<string, string> = {};
    for (const it of readRubric(olxPath)) {
      for (const c of it.credit ?? []) {
        for (const f of ['desc', 'rule'] as const) {
          const v = c[f];
          if (v) live[`${it.id}|${c.what}|${f}`] = fieldSha(String(v));
        }
      }
    }
    return { want, live, shaFile: file };
  },

  // THE ENGINE'S OWN FILE, found through `loBlocksRoot` rather than named by a
  // caller: python located it via `paths.SLOTSHEET_TS` because it had to reach
  // across the repo boundary, and this side does not.
  fails_verdict_is_mirrored_in_the_app: () => {
    const lo = loBlocksRoot();
    const name = 'slotSheet.ts';
    if (!lo) return { name, src: '' };
    return { name, src: readOrEmpty(join(lo, 'packages/shared/lib/llm', name)) };
  },

  // THE LABELS FROM THE RUBRIC, THE HEADINGS FROM THE RECORD. The engine never
  // opens a workbook -- `tools/export_grader_columns.py` exports the headings
  // alone, filed with the INSTRUMENT because a second rubric for the same
  // handout joins to the same sheet.
  gold_columns_are_the_item_labels: (ns) => {
    const forms = itemForms(ns);
    const labels: Record<string, Record<string, string>> = {};
    for (const it of readRubric(rubricPath(ns))) {
      const f = String(forms[it.id] ?? '');
      const label = it.label;
      if (!f || !label) continue;
      (labels[f] ??= {})[label] = it.id;
    }
    let sheets: Record<string, unknown> = {};
    try {
      const doc = readJson(instrumentDataFile(ns, 'grader_columns.json')) as
        Record<string, unknown>;
      sheets = (doc?.handouts ?? {}) as Record<string, unknown>;
    } catch {
      // ABSENT RECORD IS NOT AN EMPTY ONE. Leaving `sheets` empty makes every
      // handout report "cannot be read", which is the honest answer: nothing
      // here confirmed the join.
      sheets = {};
    }
    return { labels, sheets };
  },

  // BOTH SIDES READ HERE: the block's own schema, and the handouts that author
  // against it. Python had to cross the repository boundary for the first; this
  // side crosses nothing.
  action_attributes_are_declared_in_the_block: (ns) => {
    const lo = loBlocksRoot();
    const blockName = 'LLMAction.ts';
    if (!lo) return { blockName, blockSrc: '', used: null };
    const blockSrc = readOrEmpty(
      join(lo, 'packages/shared/components/blocks/action', blockName));
    if (!blockSrc) return { blockName, blockSrc: '', used: null };

    // the COURSE FOLDER: a course file is named relative to its own folder, not to the collection, which holds several courses
    const dir = courseLocation(ns);
    if (!dir) return { blockName, blockSrc, used: null };
    const used: Record<string, string[]> = {};
    const names = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.olx'));
    for (const stem of handoutStems(ns, names)) {
      const txt = readOrEmpty(join(dir, `${stem}.olx`));
      for (const tag of txt.match(/<LLMAction\b[^>]*>/g) ?? []) {
        const idm = /(?:^|\s)id="([^"]+)"/.exec(tag);
        const site = idm ? idm[1] : `${stem}.olx`;
        for (const a of tag.matchAll(/(?:^|\s)(\w+)="/g)) {
          const at = (used[a[1]] ??= []);
          // A SET IN PYTHON, so a tag authoring the same attribute twice
          // counts once and the count in the message matches the sites.
          if (!at.includes(site)) at.push(site);
        }
      }
    }
    return { blockName, blockSrc, used };
  },

  // THE GENERATORS ARE OURS. `attributeAssembler.generatedAttrs` is the same
  // computation the prompt writer uses, so this cannot pass by comparing a
  // transcription to itself -- and no part of it reaches for python.
  //
  // THE STAGED INPUTS ARE REQUIRED, not optional. They are produced by
  // `build:rubric-inputs` from the staged rubric; without them every generator
  // would return nothing and every attribute would read as DIVERGED. An absent
  // file therefore yields NO ITEMS rather than a spurious corpus of findings --
  // the python path passes its own payload and never reaches this.
  olx_attributes_are_all_generated: (ns) => {
    const known = Object.keys(generatedAttrs('probe', {
      credit: [], slotSpec: [], counts: [], cover: [], equals: [], onlyif: [],
      requires: [], derived: [], forbid: [], expect: [], maps: [],
      choicesDeclared: [], choicesUsers: [], choicesSourced: [],
      max: null, maxPresent: false,
    })).sort();
    const skip = ['id', 'target'];
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const handAuthored: Record<string, string> = {};
    for (const { key, value } of decodeTable(decl.HAND_AUTHORED_SHEET_ATTRS)) {
      handAuthored[String(key)] = String(value ?? '');
    }
    const lo = loBlocksRoot();
    const dir = collectionDir(ns);
    if (!lo || !dir) return { known, skip, handAuthored, items: [] };
    let inputs: Record<string, any>;
    try {
      inputs = readJson(join(lo, '.stage', 'assembler-inputs.json')) as
        Record<string, any>;
    } catch {
      return { known, skip, handAuthored, items: [] };
    }
    const items: Array<Record<string, unknown>> = [];
    for (const id of Object.keys(inputs).filter(k => !k.startsWith('_')).sort()) {
      const d = inputs[id];
      const action = String(d?.action ?? '');
      const file = String(d?.handoutFile ?? '');
      if (!action || !file) continue;
      const txt = readOrEmpty(join(dir, file));
      // THE ITEM'S OWN TAG, found by its action id -- not the first LLMAction
      // in the file, which would compare one item's attributes against
      // another's generators and report both as diverged.
      const tag = (txt.match(/<LLMAction\b[^>]*>/g) ?? [])
        .find(x => new RegExp(`(?:^|\\s)id="${action}"`).test(x));
      if (!tag) continue;
      const attrs: Array<[string, string]> = [];
      // `[A-Za-z_]+`, matching python exactly. See the note beside the
      // python scan: widening one side alone would make the two disagree
      // about SCOPE while both still reported zero.
      for (const m of tag.matchAll(/\b([A-Za-z_]+)="([^"]*)"/g)) {
        attrs.push([m[1], m[2]]);
      }
      const generated: Record<string, string | null> = {};
      const errors: Record<string, string> = {};
      let all: Record<string, string | null> = {};
      try {
        all = generatedAttrs(id, d.attrInputs);
      } catch (e) {
        for (const n of known) errors[n] = `${(e as Error).name}: ${String((e as Error).message).slice(0, 80)}`;
      }
      for (const n of known) generated[n] = all[n] ?? null;
      items.push({ item: id, attrs, generated,
                   ...(Object.keys(errors).length ? { errors } : {}) });
    }
    return { known, skip, handAuthored, items };
  },

  // READS THE RECORD AND NOTHING ELSE -- no submission is opened, which is what
  // lets this run on a machine with no corpus at all.
  response_fixtures_are_intact: (ns) => {
    const dir = join(instrumentDerived(ns), 'responses');
    let names: string[] = [];
    try { names = readdirSync(dir).filter(f => f.endsWith('.json')).sort(); }
    catch { return { items: [], frozenElsewhere: [] }; }
    const items: Array<Record<string, unknown>> = [];
    for (const name of names) {
      let doc: Record<string, unknown>;
      try { doc = readJson(join(dir, name)) as Record<string, unknown>; }
      catch { items.push({ item: name.replace(/\.json$/, ''), missing: true }); continue; }
      const cells = (doc.cells ?? {}) as Record<string, any>;
      const pids = Object.keys(cells).sort((a, b) => Number(a) - Number(b));
      items.push({
        item: String(doc.item ?? name.replace(/\.json$/, '')),
        sha: doc.sha,
        computed: cellSha(Object.fromEntries(
          pids.map(p => [p, cells[p]?.boxes ?? {}]))),
        cells: pids.map(p => ({ pid: p, sha: cells[p]?.sha,
                                computed: cellSha(cells[p]?.boxes ?? {}) })),
      });
    }
    return { items, frozenElsewhere: [] };
  },

  // EVERY INPUT IS A RECORD. The CELL SET comes from `fixture_cells.json`,
  // because it cannot be derived here: python keeps a cell when the item's own
  // response SECTION is at least 40 characters, which is a property of the
  // segmentation and not of the boxes. Guessing it as "every recorded cell with
  // two or more boxes" gave 169 cells against 157 and 4 findings against 0.
  //
  // THE BOXES come from `responses/`, now covering all 26 items -- including
  // the two that reconstruct from a hand-made source, so a reader no longer has
  // to know which two are special and go elsewhere. `ownBoxes` selects the
  // item's OWN fields from the full fixture, which is the step that separates a
  // response from another item's context carried alongside it.
  consensus_spans_are_disjoint: (ns) => {
    const g = gold(ns);
    const cells = fixtureCells(ns, { keepEmpty: false });
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const forms = itemForms(ns);
    const byItem = cellExclusions(ns);
    const exclusions: Record<string, Record<string, [string, string]>> = {};
    for (const [item, per] of Object.entries(byItem)) {
      const h = String(forms[item] ?? '');
      if (!h || !Object.keys(per).length) continue;
      exclusions[`${h}|${item}`] = Object.fromEntries(
        Object.entries(per).map(([pid, kw]) => [pid, kw]));
    }
    const backlog: Array<unknown[]> = [];
    for (const { key, value } of decodeTable(g.CONSENSUS_OVERLAP_BACKLOG)) {
      const k = (Array.isArray(key) ? key : []) as unknown[];
      if (k.length === 4) backlog.push([String(k[0]), Number(k[1]), String(k[2]),
                                        String(k[3]), String(value ?? '')]);
    }
    const cover: Record<string, string[][]> = {};
    for (const it of readRubric(rubricPath(ns))) {
      const groups = (it as any).cover;
      if (Array.isArray(groups) && groups.length) {
        cover[it.id] = groups.map((grp: any) => [...(grp.keys ?? [])].map(String).sort());
      }
    }
    const roles = ((decodeValue(decl.OVERLAP_SIBLING_ROLES) ?? []) as unknown[])
      .map(p => (p as unknown[]).map(String));
    return { cells, exclusions, cover, backlog, siblingRoles: roles };
  },

  // CELLS FROM THE RECORDED SET, FEEDBACK FROM `gold_rows.json`, the box
  // vocabulary and the overrides from the declarations. The graders' workbook
  // is never opened here -- `export_grader_marks.py` read it once and exported
  // the marks, which is the whole arrangement.
  fixture_agrees_with_gold: (ns) => {
    // EMPTY BOXES ARE KEPT, unlike the disjointness payload which drops them.
    // This check's whole question is whether a box is EMPTY or FILLED, and a
    // dropped empty box is not judged empty -- it is skipped, silently, exactly
    // where gold says the element was written and wrong. Reusing the other
    // assembler's cells cost 5 of 5 findings on the inverted-fixture probe.
    const cells = fixtureCells(ns, { keepEmpty: true });
    const feedback: Record<string, string> = {};
    try {
      const doc = readJson(rubricDataFile(ns, 'gold_rows.json')) as Record<string, any>;
      for (const [h, pids] of Object.entries(doc.handouts ?? {})) {
        for (const [pid, items] of Object.entries(pids as Record<string, any>)) {
          for (const [item, row] of Object.entries(items as Record<string, any>)) {
            const fb = (row ?? {}).feedback;
            if (typeof fb === 'string' && fb) feedback[`${h}|${pid}|${item}`] = fb;
          }
        }
      }
    } catch { /* no marks recorded: every cell falls through as no-feedback */ }

    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const boxWords: Record<string, Record<string, { want: string[]; forbid: string[] }>> = {};
    for (const { key, value } of decodeTable(decl.GOLD_BOX_WORDS)) {
      const per: Record<string, { want: string[]; forbid: string[] }> = {};
      for (const row of decodeTable(value)) {
        const v = decodeValue(row.value) as unknown[];
        // A TUPLE-OF-TUPLES MEANS (want, forbid); a flat tuple is all `want`.
        const nested = Array.isArray(v) && Array.isArray(v[0]);
        per[String(row.key)] = nested
          ? { want: (v[0] as unknown[]).map(String),
              forbid: ((v[1] ?? []) as unknown[]).map(String) }
          : { want: (v ?? []).map(String), forbid: [] };
      }
      boxWords[String(key)] = per;
    }
    const overrides: Record<string, string> = {};
    for (const { key, value } of decodeTable(gold(ns).FIXTURE_GOLD_OVERRIDES)) {
      const k = (Array.isArray(key) ? key : []) as unknown[];
      if (k.length === 3) overrides[`${k[0]}|${k[1]}|${k[2]}`] = String(value ?? '');
    }
    return { cells, feedback, boxWords, overrides };
  },

  // THE CORPUS IS THE RECORD. Every cell's whole text, joined in SORTED field
  // order -- the joins are where a 6-gram crosses a box boundary, so the order
  // decides which grams exist, and both sides sort for that reason.
  rule_examples_are_not_corpus: (ns) => {
    const forms = itemForms(ns);
    const corpus = corpusCells(ns);

    const notes = slotNotes(rubricPath(ns));
    const g = gold(ns);
    const byItem = cellExclusions(ns);
    const excl: Record<string, number[]> = {};
    for (const [item, per] of Object.entries(byItem)) {
      excl[item] = Object.keys(per).map(Number).sort((a, b) => a - b);
    }
    const items = readRubric(rubricPath(ns)).map((it) => {
      const parts: string[] = [];
      const guidance = (it as any).guidance;
      if (Array.isArray(guidance)) parts.push(...guidance.map(String));
      else if (guidance) parts.push(String(guidance));
      for (const c of it.credit ?? []) {
        parts.push(String(c.desc ?? ''), String(c.rule ?? ''));
      }
      // A NOTE KEYED `owner:slot` BELONGS TO ITS OWNER; one with no slot part
      // is shared, and python appends it to every item.
      for (const [key, note] of Object.entries(notes)) {
        const at = key.indexOf(':');
        const owner = at < 0 ? key : key.slice(0, at);
        const slot = at < 0 ? '' : key.slice(at + 1);
        if (!slot || owner === it.id) parts.push(String(note));
      }
      return { h: Number(forms[it.id] ?? 0), id: it.id, parts,
               question: String((it as any).question ?? ''),
               excluded: excl[it.id] ?? [] };
    });
    const backlog = ((decodeValue(
      (courseJson(ns).declarations ?? {} as any).CORPUS_QUOTE_BACKLOG) ?? []) as unknown[])
      .map(p => (p as unknown[]).map(String).join('|'));
    return { corpus, items, backlog };
  },

  // THE FOUR RECORDS THIS SIDE CAN REACH, read as parsed documents so the rule
  // walks values rather than grepping text -- a path inside a `why` is a
  // quotation, and the walk is what tells the two apart.
  // THE ACTION'S REFS AGAINST ONE REAL RECONSTRUCTION. The frozen response
  // record is what the harness actually hands a grader, so a target absent
  // from it is a target no cell can fill. One participant is enough: a ref
  // resolves for all of them or for none.
  ref_targets_resolve: (ns) => {
    const forms = itemForms(ns);
    const acts = actionMap(readRubric(rubricPath(ns)));
    const items: Array<{ item: string; targets: string[]; fixtureKeys: string[]; error: string | null }> = [];
    for (const item of Object.keys(acts).sort()) {
      const form = String(forms[item] ?? '');
      const src = form ? handoutSrc(ns, form) : '';
      if (!src) continue;
      // THE FROZEN RECORD FOR THIS ITEM, not the 8-item summary. `fixtureCells`
      // scopes to `fixture_cells.json`, which names the cells a DIFFERENT check
      // measures; reading it here saw 8 items of 23 and reported zero refs,
      // which is an empty payload wearing a clean answer's clothes.
      let boxes: Record<string, string> | null = null;
      try {
        const doc = readJson(join(instrumentDerived(ns), 'responses', `${item}.json`)) as
          { cells?: Record<string, { boxes?: Record<string, string> }> } | null;
        const cells = doc?.cells ?? {};
        const first = Object.keys(cells).sort()[0];
        if (first !== undefined) boxes = cells[first]?.boxes ?? {};
      } catch { boxes = null; }
      if (!boxes) continue;            // no record: another check's business
      const body = actionBody(src, acts[item]) ?? '';
      const targets = [...new Set(
        [...body.matchAll(/<Ref\b[^>]*target="([^"]*)"/g)].map(m => m[1]))];
      items.push({ item, targets, fixtureKeys: Object.keys(boxes), error: null });
    }
    return { items };
  },

  // EACH ITEM'S `derived` RULES AGAINST THE FIELDS ITS REFS CAN RESOLVE.
  // `CONTEXT_REFS` is a generator table in the course file, keyed by form; the
  // harness joins a field id to a section through it, so a field absent from it
  // is a field the harness cannot read.
  derived_fields_resolve: (ns) => {
    const forms = itemForms(ns);
    const ctx = (((courseJson(ns).generator ?? {}) as Record<string, unknown>)
                 .CONTEXT_REFS ?? {}) as Record<string, Record<string, string>>;
    const acts = actionMap(readRubric(rubricPath(ns)));
    const items = Object.keys(acts).sort().map(item => {
      const form = String(forms[item] ?? '');
      const refFields = Object.keys(ctx[form] ?? {});
      const src = handoutSrc(ns, form);
      let derived: Array<{ key: string; fields: string[] }> = [];
      let error: string | null = null;
      if (!src) error = `cannot read handout ${form}`;
      else {
        // THE OPENING TAG, not the body. `derived=` is an ATTRIBUTE of the
        // action element; python reads it off `open_tag`. Reading the body
        // instead found nothing at all -- three items carry the rule and the
        // assembler reported zero, which is the empty payload agreeing with
        // python's empty answer for the wrong reason.
        const tag = sheetTag(src, acts[item]) ?? '';
        derived = parseDerived(tagAttr(tag, 'derived') ?? '')
          .map(r => ({ key: String((r as { key?: string }).key ?? ''),
                       fields: ((r as { fields?: string[] }).fields ?? []).map(String) }));
      }
      return { item, hasBlock: Boolean(form), error, refFields, derived };
    });
    return { items };
  },

  // ALL THREE TEXTS, and a null composed copy for one never built.
  composed_documents_are_current: (ns) => {
    const docs = SPLIT_DOCS.map(name => {
      const g = splitGenericPath(name);
      const s = splitSpecificPath(ns, name);
      const c = splitComposedPath(ns, name);
      return {
        name,
        generic: existsSync(g) ? readFileSync(g, 'utf8') : '',
        specific: existsSync(s) ? readFileSync(s, 'utf8') : '',
        composedPath: c,
        composed: existsSync(c) ? readFileSync(c, 'utf8') : null,
      };
    });
    return { docs };
  },

  // BOTH HALVES, only where both are on disk. A document with one half has
  // nothing to compare and is the other rule's business, not this one's.
  no_composed_document_repeats_itself: (ns) => {
    const docs: Array<{ name: string; generic: string; specific: string }> = [];
    for (const name of SPLIT_DOCS) {
      const g = splitGenericPath(name);
      const s = splitSpecificPath(ns, name);
      if (!existsSync(g) || !existsSync(s)) continue;
      docs.push({ name, generic: readFileSync(g, 'utf8'), specific: readFileSync(s, 'utf8') });
    }
    return { docs };
  },

  // THE THREE PLACES A SPLIT DOCUMENT CAN BE, and whether each is there. The
  // generic half moved into this package on 2026-09-27, so both halves and the
  // composed copy are readable from here.
  every_document_is_where_its_readers_look: (ns) => {
    const docs = SPLIT_DOCS.map(name => {
      const specificPath = splitSpecificPath(ns, name);
      const readerPath = splitComposedPath(ns, name);
      return {
        name,
        specificPath,
        specificExists: existsSync(specificPath),
        readerPath,
        readerExists: existsSync(readerPath),
        declaredNoCourseHalf: NO_COURSE_HALF_SET.has(name),
      };
    });
    return { docs };
  },

  records_carry_no_machine_path: (ns) => {
    const targets: Array<[string, string]> = [
      ['course.json', metadataFile(ns, 'course.json')],
      ['PROBED.json', metadataFile(ns, 'PROBED.json')],
      ['PROBE_RECEIPTS.json', metadataFile(ns, 'PROBE_RECEIPTS.json')],
      ['MEASURED.json', metadataFile(ns, 'MEASURED.json')],
    ];
    const records: Array<{ label: string; doc: unknown }> = [];
    for (const [label, path] of targets) {
      try { records.push({ label, doc: readJson(path) }); }
      catch { /* absent on this machine: nothing to scan, not a finding */ }
    }
    return { records };
  },

  // THE REGISTRY IS THIS PACKAGE'S OWN `primitives.json`, which is the whole
  // reason this check can live here: the claim is about what the ENGINE can
  // express, and the engine is where that is written down.
  prose_only_claims_are_current: (ns) => {
    let now: string[] = [];
    try {
      const reg = readJson(join(loBlocksRoot() ?? '.',
                                'packages/shared/lib/llm/primitives.json')) as
        { primitives?: Array<{ attr?: string }> };
      now = (reg.primitives ?? []).map(x => String(x.attr)).sort();
    } catch { now = []; }
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const slots: string[] = [];
    for (const { key } of decodeTable(decl.PROSE_ONLY_SLOTS)) {
      const k = (Array.isArray(key) ? key : [String(key)]) as unknown[];
      slots.push(k.map(String).join('|'));
    }
    const judgedAgainst: Record<string, string> = {};
    for (const { key, value } of decodeTable(decl.PROSE_ONLY_JUDGED_AGAINST)) {
      const k = (Array.isArray(key) ? key : [String(key)]) as unknown[];
      judgedAgainst[k.map(String).join('|')] = String(value ?? '');
    }
    return { now, slots, judgedAgainst };
  },

  // THE REGISTRY, THE TAGS AND THE PROMPTS, all from this side: `primitives.json`
  // says which keys leave the schema, the handouts carry the tags, and the
  // assembler builds the prompt the grader is sent.
  primitive_conformance: (ns) => {
    let excluding: string[] = [];
    let excludes: Record<string, string | null> = {};
    try {
      const reg = readJson(join(loBlocksRoot() ?? '.',
                                'packages/shared/lib/llm/primitives.json')) as
        { primitives?: Array<Record<string, unknown>> };
      for (const prim of reg.primitives ?? []) {
        const attr = String(prim.attr);
        excludes[attr] = (prim.excludes ?? null) as string | null;
        // `excludesKeys` IS THE CRITERION, and it is its own field for a
        // reason: `forbid` excludes keys from the schema and declares no
        // `excludes` shape, so inferring the set from `excludes` being present
        // silently drops it -- measured, 5 attributes against python's 6.
        if (prim.excludesKeys === true) excluding.push(attr);
      }
    } catch { excluding = []; excludes = {}; }

    // the COURSE FOLDER: a course file is named relative to its own folder, not to the collection, which holds several courses
    const dir = courseLocation(ns);
    const prompts = runtimePrompts(ns);
    const tags: Record<string, string> = {};
    if (dir) {
      const names = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.olx'));
      for (const stem of handoutStems(ns, names)) {
        const txt = readOrEmpty(join(dir, `${stem}.olx`));
        // BOTH ELEMENTS CARRY A SHEET. An item with no judging prompt still
        // declares primitives, and its sheet lives on `<DerivedChecks>` --
        // scanning `<LLMAction>` alone lost three items' tags entirely, which
        // is not the same as deciding they have no prompt to conform to.
        for (const tag of txt.match(/<(?:LLMAction|DerivedChecks)\b[^>]*>/g) ?? []) {
          const idm = /(?:^|\s)id="([^"]+)"/.exec(tag);
          if (idm) tags[idm[1]] = tag;
        }
      }
    }
    // KEYED BY ITEM, not by action id: python indexes the tag map by the ITEM,
    // and the action id is how the tag is found.
    //
    // SHEET-ONLY ITEMS COUNT TOO. Python walks `{**ACTION, **SHEET_ONLY}` -- an
    // item can carry a slot sheet with no judging prompt, and its tag still
    // declares primitives. Taking only the items with an action gave 23 tags
    // against python's 26; those three are skipped LATER, by the `inAction`
    // test, which is a different decision from never looking at them.
    const items = readRubric(rubricPath(ns));
    const actionOf = actionMap(items);
    // SHEET-ONLY ITEMS NAME THEIR ELEMENT IN THE RECORD. An item can carry a
    // slot sheet with no judging prompt -- its sheet lives on `<DerivedChecks>`
    // -- and the rubric's parsed form has no `asks` for it. `prompt_sheet_only`
    // on the course file's item entry is that mapping, already exported.
    const sheetOnly: Record<string, string> = {};
    for (const entry of (courseJson(ns).items ?? []) as Array<Record<string, unknown>>) {
      const only = entry.prompt_sheet_only;
      if (typeof only === 'string' && only) sheetOnly[String(entry.id)] = only;
    }
    const byItem: Record<string, string> = {};
    for (const it of items) {
      const action = (actionOf as Record<string, unknown>)[it.id] ?? sheetOnly[it.id];
      const tag = action ? tags[String(action)] : undefined;
      if (tag) byItem[it.id] = tag;
    }
    return { excluding: excluding.sort(), excludes, tags: byItem,
             inAction: Object.keys(prompts).sort(), prompts };
  },

  // THE PROMPTS THE GRADER IS SENT, assembled here. Restricted to the items
  // that SHOW their boxes: python iterates `RESPONSE`, and an item with no
  // response section has no boxes to bound.
  response_boxes_are_bounded: (ns) => {
    const all = runtimePrompts(ns);
    const prompts: Record<string, string> = {};
    for (const [item, text] of Object.entries(all)) {
      if (text.includes('## Student response to grade')) prompts[item] = text;
    }
    return { prompts };
  },

  // THE RECEIPTS ARE A RECORD; the prompts, tags and aliases are what
  // `questionFor` needs to re-derive what ships now.
  probe_receipts_match_shipping: (ns) => {
    const base = probeQuestionInputs(ns);
    let receipts: Array<Record<string, unknown>> = [];
    try {
      const doc = readJson(metadataFile(ns, 'PROBE_RECEIPTS.json'));
      const rows = Array.isArray(doc) ? doc
        : ((doc as Record<string, unknown>)?.receipts ?? []) as unknown[];
      receipts = (rows as Array<Record<string, unknown>>).map(r => ({
        item: String(r.item ?? ''), slot: String(r.slot ?? ''),
        sha: String(r.sha ?? ''), verdict: r.verdict ?? '',
      }));
    } catch { receipts = []; }
    return { ...base, receipts, refusals: {} };
  },

  // THE `olx` COLUMN ONLY -- the web side, and the reason this reads natively.
  // The run artifacts are records under the rubric's own `out/`.
  new_slots_were_probed: (ns) => {
    const { prompts } = probeQuestionInputs(ns);
    const jobs = decodeTable(
      (courseJson(ns).declarations ?? {} as any).JOBS).map(r => String(r.key));
    const asked: Record<string, string[]> = {};
    const seen: Record<string, string[]> = {};
    for (const item of jobs.sort()) {
      const prompt = prompts[item];
      if (!prompt) continue;         // no judging prompt: nothing answerable
      asked[item] = Object.keys(checklistEntries(prompt)).sort();
      const names = new Set<string>();
      try {
        const doc = readJson(join(outDir(ns), 'pooled_olx', `${item}.runs.json`)) as
          Record<string, any>;
        for (const run of doc?.runs ?? []) {
          for (const c of run?.results ?? []) {
            for (const k of Object.keys(c?.checks ?? c?.verdicts ?? {})) names.add(k);
            for (const k of Object.keys(c?.answers ?? c?.refers_to ?? {})) names.add(k);
          }
        }
      } catch { /* nothing recorded on this side */ }
      seen[item] = [...names].sort();
    }
    const probed: Record<string, string[]> = {};
    try {
      const doc = readJson(metadataFile(ns, 'PROBE_RECEIPTS.json'));
      const rows = (Array.isArray(doc) ? doc
        : ((doc as Record<string, unknown>)?.receipts ?? [])) as Array<Record<string, unknown>>;
      for (const r of rows) {
        (probed[String(r.item)] ??= []).push(String(r.slot));
      }
    } catch { /* no receipts */ }
    return { asked, seen, probed };
  },

  // THE GENERATED PROMPT against the SHIPPED handout, both read here.
  written_rules_reach_the_shipped_prompt: (ns) => {
    const { prompts } = probeQuestionInputs(ns);
    const forms = itemForms(ns);
    // the COURSE FOLDER: a course file is named relative to its own folder, not to the collection, which holds several courses
    const dir = courseLocation(ns);
    const src: Record<string, string> = {};
    if (dir) {
      const names = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.olx'));
      for (const stem of handoutStems(ns, names)) {
        src[stem] = readOrEmpty(join(dir, `${stem}.olx`));
      }
    }
    const shipped: Record<string, string> = {};
    for (const item of Object.keys(prompts)) {
      const stem = handoutName(ns, forms[item] ?? '').replace(/\.olx$/, '');
      if (src[stem] !== undefined) shipped[item] = src[stem];
    }
    // RECORDED ON A WEB SIDE, FROM THE LEDGER -- which is what python reads.
    // A first version inferred it from a `.runs.json` existing under the web
    // column: it happened to agree on every item this check iterates, and
    // would have diverged the moment an artifact was archived or a column
    // recorded without one. The ledger is the record of what has a NUMBER.
    const recorded: string[] = [];
    try {
      const ledger = readJson(metadataFile(ns, 'MEASURED.json')) as
        Record<string, any>;
      const web = new Set(webSides(ns));
      for (const [item, rec] of Object.entries(ledger?.items ?? {})) {
        if ([...web].some(s => (rec as Record<string, unknown>)?.[s])) {
          recorded.push(item);
        }
      }
    } catch { /* no ledger: nothing has a number to invalidate */ }
    return { prompts, shipped, recorded: recorded.sort() };
  },

  no_declaration_cites_a_suspect_cell: (ns) => {
    const forms = itemForms(ns);
    const homeOf: Record<string, number> = {};
    for (const it of readRubric(rubricPath(ns))) {
      const f = Number(forms[it.id]);
      if (Number.isFinite(f) && !(it.id in homeOf)) homeOf[it.id] = f;
    }
    const g = gold(ns);
    const entries: Array<Record<string, unknown>> = [];
    for (const { key, value } of decodeTable(g.CORRECTED_GOLD)) {
      const cell = Array.isArray(key) ? key : [String(key), ''];
      const v = (value ?? {}) as Record<string, unknown>;
      entries.push({ table: 'forms.CORRECTED_GOLD', label: `${cell[0]}/p${cell[1]}`,
                     home: String(cell[0]), why: String(v.why ?? '') });
    }
    for (const d of (Array.isArray(g.GOLD_DIVERGENCES) ? g.GOLD_DIVERGENCES : [])) {
      const o = (d ?? {}) as Record<string, unknown>;
      const cells = (decodeValue(o.cells) ?? []) as unknown[];
      const first = cells.length ? (cells[0] as unknown[]) : [];
      const home = first.length ? String(first[0]) : '';
      entries.push({ table: 'forms.GOLD_DIVERGENCES',
                     label: String(o.code ?? (home || '?')),
                     home, why: String(o.why ?? '') });
    }
    for (const name of ['GOLD_SLOT_DISAGREEMENTS_KNOWN', 'GOLD_SLOT_BOUNDS_KNOWN',
                        'GOLD_CODE_KNOWN']) {
      for (const { key, value } of decodeTable(g[name])) {
        const cell = Array.isArray(key) ? key : [String(key), ''];
        entries.push({ table: `measured.${name}`, label: `${cell[0]}/p${cell[1]}`,
                       home: String(cell[0]), why: String(value ?? '') });
      }
    }
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const suspect: Record<string, number[]> = {};
    for (const { key, value } of decodeTable(decl.HANDOUT_FIELDS)) {
      const fields = (decodeValue(value) ?? {}) as Record<string, unknown>;
      suspect[String(key)] = ((fields.suspect_participants ?? []) as unknown[]).map(Number);
    }
    return { entries, homeOf, suspect };
  },

  citations_match_exclusions: (ns) => {
    const items = readRubric(rubricPath(ns));
    const forms = itemForms(ns);
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const hf: Record<string, Record<string, unknown>> = {};
    for (const { key, value } of decodeTable(decl.HANDOUT_FIELDS)) {
      hf[String(key)] = (decodeValue(value) ?? {}) as Record<string, unknown>;
    }
    const exemplars: Record<string, number[]> = {};
    for (const [form, fields] of Object.entries(hf)) {
      exemplars[form] = ((fields.exemplar_participants ?? []) as unknown[]).map(Number);
    }
    return {
      // `_prompt_text`: every field of the item that reaches the prompt.
      items: items.map((it) => {
        const form = String(forms[it.id] ?? '');
        const registry = (hf[form]?.cited_participants ?? {}) as Record<string, unknown[]>;
        const parts: string[] = [];
        for (const g of it.guidance ?? []) parts.push(g);
        if (it.question) parts.push(it.question);
        if (it.label) parts.push(it.label);
        for (const c of it.credit ?? []) if (c.desc) parts.push(String(c.desc));
        for (const d of it.deductions ?? []) parts.push(d);
        return {
          form: /^-?\d+$/.test(form) ? Number(form) : form,
          id: it.id,
          promptText: parts.join('\n'),
          registered: ((registry[it.id] ?? []) as unknown[]).map(Number),
        };
      }),
      exemplars,
    };
  },

  enumerated_slots_cover_the_rubric: (ns) => {
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const tables = Object.keys(decl).map(name => ({
      name,
      keys: decodeTable(decl[name])
        .map(({ key }) => key)
        .filter((k): k is PyKey[] => Array.isArray(k) && k.length === 2)
        .map(k => [String(k[0]), String(k[1])] as [string, string]),
    }));
    // THE WIDTH IS READ OFF THE SLOTS, not assumed: a parallel family is a
    // criterion asked more than once, and how many is whatever the rubric says.
    const widths: Record<string, Record<string, number>> = {};
    for (const it of readRubric(rubricPath(ns))) {
      const names = new Set<string>();
      for (const g of it.counts ?? []) for (const s of g.slots ?? []) names.add(String(s));
      for (const c of it.credit ?? []) if (c.what) names.add(String(c.what));
      for (const n of names) {
        const m = /^(.+?)_(\d+)$/.exec(n);
        if (!m) continue;
        widths[it.id] ??= {};
        widths[it.id][m[1]] = Math.max(widths[it.id][m[1]] ?? 0, Number(m[2]));
      }
    }
    return { tables, widths };
  },

  corrected_gold_matches_the_sheet: (ns) => {
    const rows = goldRows(ns);
    const raw = Object.keys(rows).sort((a, b) => Number(a) - Number(b)).map(form => ({
      form,
      rows: Object.fromEntries(Object.entries(rows[form]).map(([pid, cells]) => [
        pid,
        Object.fromEntries(Object.entries(cells).map(([item, cell]) => [
          item,
          (cell as Record<string, unknown>).score_raw as number | null ?? null,
        ])),
      ])),
    }));
    const fixes = decodeTable(gold(ns).CORRECTED_GOLD).map(({ key, value }) => {
      const cell = Array.isArray(key) ? key : [String(key), ''];
      const v = (value ?? {}) as Record<string, unknown>;
      return { item: String(cell[0]), pid: String(cell[1]),
               was: Number(v.was), score: Number(v.score), why: String(v.why ?? '') };
    }).sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1
                       : Number(a.pid) - Number(b.pid)));
    return { raw, fixes };
  },

  gold_tables_have_no_duplicate_keys: (ns) => {
    const path = rubricDataFile(ns, 'gold.json');
    let raw = '';
    try { raw = readFileSync(path, 'utf8'); } catch { raw = ''; }
    return { raw, path };
  },

  gold_scores_are_attainable: (ns) => {
    const forms = itemForms(ns);
    const items = readRubric(rubricPath(ns));
    const byId = new Map(items.map(it => [it.id, it]));
    const rows = goldRows(ns);
    const cells: Array<Record<string, unknown>> = [];
    for (const form of Object.keys(rows).sort((a, b) => Number(a) - Number(b))) {
      for (const pid of Object.keys(rows[form]).sort()) {
        for (const item of Object.keys(rows[form][pid]).sort()) {
          if (!byId.has(item)) continue;
          const raw = rows[form][pid][item]?.score;
          if (raw === null || raw === undefined) continue;
          const score = Number(raw);
          if (!Number.isFinite(score)) continue;
          cells.push({ form: Number(form), pid, item, score });
        }
      }
    }
    return {
      items: items.map(it => ({
        id: it.id,
        form: formOf(ns, it.id) ?? forms[it.id] ?? '',
        max: Number((it as Record<string, unknown>).max ?? 0),
        credit: (it.credit ?? []).map(c => ({
          pts: c.pts ?? null, reported: Boolean(c.reported), gates: Boolean(c.gates),
        })),
      })),
      cells,
    };
  },

  prompt_deviation_tables_are_current: (ns) => {
    const rubricItems = readRubric(rubricPath(ns));
    const action = actionMap(rubricItems);
    const cj = courseJson(ns);
    const cjItems = (cj.items ?? []) as Array<Record<string, unknown>>;
    const sheetOnly: Record<string, string> = {};
    for (const it of cjItems) {
      if (it.prompt_sheet_only) sheetOnly[String(it.id)] = String(it.prompt_sheet_only);
    }
    const field = (name: string): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const it of cjItems) {
        if (it[name] !== undefined) out[String(it.id)] = decodeValue(it[name]);
      }
      return out;
    };
    // `CONTEXT` HAS A COURSE-LEVEL RESIDUE. `_generator_table("prompt_context",
    // "CONTEXT")` merges `generator.CONTEXT__non_item` on top of the item
    // fields: a handout's section headings (`_utb`, `_wgb`) are context too and
    // an item entry is the wrong home for a section. They are `_`-prefixed and
    // therefore skipped by the rule -- but a payload that omitted them would
    // stop matching python's table the day a non-underscore key appeared there.
    const gen = (cj.generator ?? {}) as Record<string, unknown>;
    const contextExtra = (decodeValue(gen.CONTEXT__non_item) ?? {}) as Record<string, unknown>;
    const tables: Record<string, Record<string, unknown>> = {
      RESPONSE: field('prompt_response'),
      CONTEXT: { ...field('prompt_context'), ...contextExtra },
      ITEM_NOTES: field('prompt_notes'),
      OMIT_CREDIT: {},
      OMIT_DEDUCTION: {},
      OMIT_GUIDANCE: field('prompt_omit_guidance'),
    };
    const rubric: Record<string, Record<string, unknown>> = {};
    for (const it of rubricItems) {
      rubric[it.id] = {
        guidance: (it.guidance ?? []).join(' '),
        credit: (it.credit ?? []).map(c => String(c.what)),
        deductions: (it.charges ?? []).map(c => String(c.code)),
      };
    }
    return {
      items: [...new Set([...Object.keys(action), ...Object.keys(sheetOnly)])],
      tables, rubric,
    };
  },

  slot_rules_are_vocabulary_neutral: (ns) => {
    const items = readRubric(rubricPath(ns));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const slots: Array<Record<string, unknown>> = [];
    for (const it of items) {
      const opts = webSlotOptions(handoutSrc(ns, forms[it.id]), action[it.id]);
      for (const c of it.credit ?? []) {
        if (!c.rule) continue;
        const paper = new Set<string>([
          ...((c.verdicts ?? []) as string[]),
          ...Object.keys((c.codes ?? {}) as Record<string, string>),
          'met', 'absent',
        ]);
        for (const grp of it.cover ?? []) {
          if ((grp.keys ?? []).includes(String(c.what))) {
            for (const v of grp.verdicts ?? []) paper.add(v);
          }
        }
        const web = opts ? opts.get(String(c.what)) : undefined;
        slots.push({
          form: forms[it.id] ?? '', item: it.id, what: String(c.what),
          rule: String(c.rule),
          offeredPaper: [...paper],
          offeredWeb: web ? [...web] : null,
        });
      }
    }
    return { slots, known: [...KNOWN_VERDICTS] };
  },

  the_expanded_rubric_is_current: (ns) => {
    const authored = rubricPath(ns);
    const expanded = expandedRubricPath(ns);
    const read = (f: string): string | null => {
      try { return readFileSync(f, 'utf8'); } catch { return null; }
    };
    const src = existsSync(authored) ? read(authored) : null;
    const have = existsSync(expanded) ? read(expanded) : null;
    return {
      authoredName: join(basename(dirname(authored)), basename(authored)),
      authoredExists: existsSync(authored),
      expandedPath: expanded,
      expandedExists: existsSync(expanded),
      src, have,
    };
  },

  // TWO PROJECTIONS OF ONE DEFINITION, compared on their slot KEYS.
  //
  // THE POPULATION IS python's `sorted(ACTION)` -- 23 of 26 -- and that is
  // VERIFIED, not assumed: `actionMap` keys on the rubric's `asks`, which the
  // three sheet-only items do not carry (their sheets live on `<DerivedChecks>`
  // and `prompt_sheet_only` names the element instead). Measured: 26 rubric
  // items, 23 actionMap keys, missing exactly T1, T2, 1b. Those three are NOT a
  // coverage gap -- the staged rubric declares no `<Slot>` for them either, so
  // there is nothing to compare.
  //
  // THE RUBRIC SIDE USES `stagedRubricSlots`, NOT `sheetSlots`: see that
  // function for why reusing the other reader would report `entryExists: false`
  // -- a FALSE finding -- for any item it silently drops.
  sheet_matches_rubric: (ns) => {
    const items = readRubric(rubricPath(ns));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const staged = stagedRubricPath(ns);

    // A MISSING BUILD IS NOT A PASS. python raises FileNotFoundError here and
    // turns it into a finding: an unbuilt artifact is not evidence that the
    // sheet and the rubric agree.
    if (!existsSync(staged)) {
      return { rubricError: { kind: 'unstaged', detail:
        `the rubric component has not been staged (${staged}); run ` +
        '`npm run build:stage-content` -- an unbuilt artifact is not ' +
        'evidence that the sheet and the rubric agree' }, items: [] };
    }
    let rubric: Record<string, string[]>;
    try {
      rubric = stagedRubricSlots(staged);
    } catch (e) {
      return { rubricError: { kind: 'unparsable', detail:
        `the staged rubric component will not parse: ` +
        `${(e as Error).name}: ${(e as Error).message}` }, items: [] };
    }

    const out: Array<Record<string, unknown>> = [];
    for (const item of Object.keys(action).sort()) {
      const row: Record<string, unknown> = { item };
      const tag = sheetTag(handoutSrc(ns, forms[item]), action[item]);
      // EVERY FAILURE TRAVELS AS DATA. This check's own first version used a
      // bare `except: continue`, reported 0 findings while comparing NOTHING,
      // and passed two injected failures.
      if (!tag) {
        row.error = `no <LLMAction id="${action[item]}"> in the handout`;
        out.push(row);
        continue;
      }
      const named = tagAttr(tag, 'rubricDef');
      row.rubricDef = named ?? null;
      if (named) {
        const entry = rubric[named];
        row.entryExists = entry !== undefined;
        if (entry !== undefined) {
          // THE TAG'S OWN `verdicts=`, falling back to `met|absent` -- python's
          // `_slots_attr` default. An EMPTY list instead makes `parseSlots`
          // drop every slot relying on the default: 10 keys where python reads
          // 18, on a character-identical spec.
          const declared = (tagAttr(tag, 'verdicts') ?? '').split('|').filter(Boolean);
          const defaults = declared.length ? declared : ['met', 'absent'];
          let parsed: Array<Record<string, unknown>>;
          try {
            parsed = parseSlots(tagAttr(tag, 'slots') ?? '', defaults) as
                     Array<Record<string, unknown>>;
          } catch (e) {
            row.error = `its slots= will not parse: ${(e as Error).message}`;
            out.push(row);
            continue;
          }
          const sheetKeys = parsed.map(x => String(x.key)).filter(Boolean);
          // python sorts a SET on both sides: membership, not order or count.
          row.sheetKeys = [...new Set(sheetKeys)].sort();
          row.rubricKeys = [...new Set(entry)].sort();
        }
      }
      out.push(row);
    }
    return { rubricError: null, items: out };
  },

  sheet_slots_reach_the_rubric: (ns) => {
    const items = readRubric(rubricPath(ns));
    const byId = new Map(items.map(it => [it.id, it]));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const criteria = new Set(items.filter(i => i.deriveFromCriteria).map(i => i.id));
    const cj = courseJson(ns);
    const decl = (cj.declarations ?? {}) as Record<string, unknown>;
    const alias: Record<string, string[]> = {};
    for (const { key, value } of decodeTable(decl.SIDE_ALIAS)) {
      const v = decodeValue(value);
      alias[String(key)] = Array.isArray(v) ? v.map(String) : [String(v)];
    }
    const appOnly = decodeTable(decl.APP_ONLY_SLOTS).map(({ key }) => {
      const k = (Array.isArray(key) ? key : []) as string[];
      return [String(k[0] ?? ''), String(k[1] ?? '')] as [string, string];
    });
    const out: Array<Record<string, unknown>> = [];
    for (const id of Object.keys(action).sort()) {
      if (criteria.has(id)) continue;
      const tag = sheetTag(handoutSrc(ns, forms[id]), action[id]);
      if (!tag) continue;
      const spec = tagAttr(tag, 'slots');
      if (spec === null) continue;
      const have = spec.split('|').filter(s => s.trim())
        .map(s => s.split(':')[0].replace(/^!+/, '').trim());
      const it = byId.get(id);
      out.push({ id, have,
                 rubric: (it?.credit ?? []).map(c => String(c.what)) });
    }
    return { items: out, alias, appOnly };
  },

  rubric_slots_reach_the_sheet: (ns) => {
    const items = readRubric(rubricPath(ns));
    const byId = new Map(items.map(it => [it.id, it]));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const cj = courseJson(ns);
    const sheetOnly: Record<string, string> = {};
    for (const it of ((cj.items ?? []) as Array<Record<string, unknown>>)) {
      if (it.prompt_sheet_only) sheetOnly[String(it.id)] = String(it.prompt_sheet_only);
    }
    const all = { ...action, ...sheetOnly };
    const decl = (cj.declarations ?? {}) as Record<string, unknown>;
    const alias: Record<string, string[]> = {};
    for (const { key, value } of decodeTable(decl.SIDE_ALIAS)) {
      const v = decodeValue(value);
      alias[String(key)] = Array.isArray(v) ? v.map(String) : [String(v)];
    }
    return {
      items: Object.keys(all).sort().map((id) => {
        const tag = sheetTag(handoutSrc(ns, forms[id]), all[id]);
        let have: string[] = [];
        if (tag) {
          const declared = (tagAttr(tag, 'verdicts') ?? '')
            .split(',').map(s => s.trim()).filter(Boolean);
          const defaults = declared.length ? declared : ['met', 'absent'];
          try {
            have = (parseSlots(tagAttr(tag, 'slots') ?? '', defaults) as
              Array<Record<string, unknown>>).map(s => String(s.key));
          } catch { have = []; }
        }
        const it = byId.get(id);
        return {
          id,
          have,
          credit: (it?.credit ?? []).map(c => ({
            what: String(c.what), verdicts: (c.verdicts ?? []) as string[],
          })),
        };
      }),
      alias,
    };
  },

  // MOVED OFF PYTHON 2026-09-27, with the archive reader. It walks EVERY
  // recorded artifact rather than the ledger's one-per-column view, because
  // the question is "does any recorded artifact contain an impossible triple",
  // and the corpus keeps every artifact it has written.
  //
  // THE ERA GATE IS THE WHOLE OF THE FILTERING, and it is not optional: an
  // artifact scored by code that has since changed is not evidence about
  // today's behaviour. Python kept this gate when the rest of the check was
  // ported for exactly that reason; it is native now because the fingerprint is.
  count_scaffolds_are_arithmetic: (ns) => {
    const artifacts: Array<Record<string, unknown>> = [];
    for (const path of runsFiles(ns)) {
      const name = path.split('/').pop() ?? path;
      const item = name.slice(0, -'.runs.json'.length);
      let doc: Record<string, unknown>;
      try {
        doc = JSON.parse(readFileSync(path, 'utf8'));
      } catch { continue; }
      const got = eraStamp(doc, item, 'web_score_sha');
      let want: string;
      try { want = shaFor(ns, 'score', item); } catch { continue; }
      if (!got || got !== want) continue;
      const runs = ((doc.runs ?? []) as Array<Record<string, unknown>>).map(run => ({
        results: ((run?.results ?? []) as Array<Record<string, unknown>>).map(r => ({
          // `?? null`, NOT bare `??`. python writes `"cell": null` when a
          // result names neither; `undefined` makes JSON.stringify DROP the
          // key, so the payload differs by an absent field rather than a null
          // one -- invisible in a length check and fatal to a byte comparison.
          cell: r.participant_id ?? r.cell ?? null,
          values: resultValues(r),
        })),
      }));
      const dir = path.split('/').slice(-2)[0];
      artifacts.push({ label: `${dir}/${name}`, runs });
    }
    return { artifacts };
  },

  // MOVED OFF PYTHON 2026-09-27. It needed the RUN ARCHIVE and the app-code
  // fingerprint; the fingerprint came here first, and `archive.ts` brings the
  // rest. Nothing about a JSON artifact on disk needed python -- what it needed
  // was a reader, and python happened to own the only one.
  //
  // PROVEN AGAINST PYTHON'S PAYLOAD before it was listed in SELF_ASSEMBLING,
  // which is what that list means.
  web_code_is_stamped: (ns) => {
    const items: Array<Record<string, unknown>> = [];
    for (const item of Object.keys(ledger(ns).items ?? {}).sort()) {
      const doc = runsDoc(ns, item, 'olx');
      if (!doc) continue;
      const gotAsk = eraStamp(doc, item, 'web_ask_sha');
      const gotScore = eraStamp(doc, item, 'web_score_sha');
      const row: Record<string, unknown> = { item, gotAsk, gotScore };
      if (gotAsk || gotScore) {
        row.wantAsk = shaFor(ns, 'ask', item);
        row.wantScore = shaFor(ns, 'score', item);
        row.scoreNeutral = false;
        row.archiveNote = '';
      }
      items.push(row);
    }
    return { fingerprintError: null, items };
  },

  olx_corpus_references: (ns) => {
    const forms = [...new Set(Object.values(itemForms(ns)))]
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));
    return {
      forms: forms.map((form) => {
        const f2 = /^-?\d+$/.test(String(form)) ? Number(form) : form;
        // ITS OWN READ, not `handoutSrc`, because the FAILURE has to be
        // reportable: `handoutSrc` swallows the error and returns '', and the
        // finding python writes interpolates the exception.
        // the COURSE FOLDER: a course file is named relative to its own folder, not to the collection, which holds several courses
        const dir = courseLocation(ns) ?? '';
        const name = handoutName(ns, form);
        if (!name) return { form: f2, src: null, error: 'no handout_olx declared' };
        try {
          return { form: f2, src: readFileSync(join(dir, name), 'utf8'), error: null };
        } catch (e) {
          return { form: f2, src: null, error: (e as Error).message };
        }
      }),
      budget: budget(ns, 'OLX_CORPUS_REF_BUDGET'),
      // THE APPROVED TEACHING-TEXT REFERENCES. Keyed (item, pid, field); the
      // rule honours them only OUTSIDE `<LLMAction>`, because the approval was
      // about what a class reads and the same cell also appears in prompts.
      declared: decodeTable(((courseJson(ns).declarations ?? {}) as
                             Record<string, unknown>).OLX_TEACHING_REFS)
        .map(({ key, value }) => {
          const k = key as [string, number, string];
          return { item: String(k[0]), pid: Number(k[1]), field: String(k[2]),
                   why: String(value ?? '') };
        }),
    };
  },

  pick_choices_match_rubric: (ns) => {
    const items = readRubric(rubricPath(ns));
    const byId = new Map(items.map(it => [it.id, it]));
    const action = actionMap(items);
    const forms = itemForms(ns);
    const choices = rubricChoices(expandedRubricPath(ns));
    const cadenceForms = new Set(
      items.filter(it => it.cadence).map(it => String(forms[it.id] ?? '')));
    const entries: Array<Record<string, unknown>> = [];
    for (const item of Object.keys(jobs(ns)).sort()) {
      const element = action[item];
      if (!element) continue;
      const tag = sheetTag(handoutSrc(ns, forms[item]), element);
      if (!tag) continue;
      const slotsAttr = tagAttr(tag, 'slots');
      if (slotsAttr === null) continue;
      const sets: Record<string, string[]> = {};
      for (const grp of (tagAttr(tag, 'choices') ?? '').split('|')) {
        const at = grp.indexOf(':');
        if (at < 0) continue;
        const name = grp.slice(0, at).trim();
        const vals = grp.slice(at + 1).split(',').map(s => s.trim()).filter(Boolean);
        if (name && vals.length) sets[name] = vals;
      }
      for (const part of slotsAttr.split('|')) {
        const m = /pick\(([^)]+)\)/.exec(part);
        if (!m) continue;
        const slot = part.split(':')[0];
        const setName = m[1];
        // python's `_pick_verdicts`: the item's own credit first, then the
        // rubric-wide choices table, then NOT DECLARED.
        const it = byId.get(item);
        const c = (it?.credit ?? []).find(
          x => String(x.what) === slot && (x.verdicts ?? []).length);
        let want: string[] | null = null;
        if (c) want = [...(c.verdicts as string[])];
        else if (cadenceForms.has(String(forms[item])) && slot in choices) {
          want = [...choices[slot]];
        }
        entries.push({ item, slot, setName, want, have: sets[setName] ?? [] });
      }
    }
    return { entries };
  },

  every_failing_verdict_has_a_charge: (ns) => {
    const byId = new Map(readRubric(rubricPath(ns)).map(it => [it.id, it]));
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const divergences = decodeTable(decl.VERDICT_SPACE_DIVERGENCES).map(({ key }) => {
      const k = Array.isArray(key) ? key : [[], []];
      return [(k[0] ?? []) as string[], (k[1] ?? []) as string[]] as [string[], string[]];
    });
    const uncharged = decodeTable(decl.UNCHARGED_VERDICTS).map(({ key }) => {
      const k = (Array.isArray(key) ? key : []) as string[];
      return [String(k[0] ?? ''), String(k[1] ?? ''), String(k[2] ?? '')] as
        [string, string, string];
    });
    return {
      items: Object.keys(jobs(ns)).sort().map((id) => {
        const it = byId.get(id);
        return {
          id,
          credit: (it?.credit ?? []).map(c => ({
            what: String(c.what),
            pts: c.pts ?? null,
            verdicts: (c.verdicts ?? []) as string[],
            codes: (c.codes ?? {}) as Record<string, string>,
            offered: olxSlotVerdicts(ns, id, String(c.what)),
          })),
        };
      }),
      divergences,
      uncharged,
    };
  },

  verdict_vocabularies_correspond: (ns) => {
    const byId = new Map(readRubric(rubricPath(ns)).map(it => [it.id, it]));
    const sheet = sheetSlots(expandedRubricPath(ns));
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const pairs: Record<string, Record<string, string>> = {};
    for (const { key, value } of decodeTable(decl.VERDICT_PAIRS)) {
      pairs[String(key)] = (decodeValue(value) ?? {}) as Record<string, string>;
    }
    return {
      items: Object.keys(jobs(ns)).sort().map((id) => {
        const it = byId.get(id);
        const offered = new Map<string, string[]>();
        for (const s of sheet[id] ?? []) {
          offered.set(s.key, resolveOptions(s.seg ?? undefined,
                                            ['met', 'absent', 'unclear']));
        }
        return {
          id,
          slots: (it?.credit ?? []).map(c => ({
            what: String(c.what),
            codes: (c.codes ?? {}) as Record<string, string>,
            opts: offered.get(String(c.what)) ?? [],
          })),
        };
      }),
      pairs,
      hedges: [...VERDICT_HEDGES],
    };
  },

  one_writer_per_computed_key: (ns) => {
    const byId = new Map(readRubric(rubricPath(ns)).map(it => [it.id, it]));
    return {
      items: Object.keys(jobs(ns)).sort().map((id) => {
        const it = byId.get(id);
        const writers: Record<string, string[]> = {};
        for (const [prim, keys] of Object.entries(it?.kinds ?? {})) {
          writers[prim] = (keys ?? []).filter((k): k is string => Boolean(k));
        }
        const countKeys = (it?.counts ?? []).map(c => c.key).filter(Boolean);
        if (countKeys.length) writers.counts = countKeys;
        return {
          id,
          writers,
          equals: it?.equals ?? [],
          expect: it?.expect ?? [],
        };
      }),
    };
  },

  carried_notes_are_intact: (ns) => ({
    got: parseCarried(readFileSync(expandedRubricPath(ns), 'utf8')),
    want: readJson(metadataFile(ns, 'CARRIED_NOTES.json')) as Record<string, [number, number]>,
  }),

  gold_corrections_land_on_attainable_scores: (ns) => {
    const forms = itemForms(ns);
    return {
      items: readRubric(rubricPath(ns)).map(it => ({
        id: it.id,
        form: formOf(ns, it.id) ?? forms[it.id] ?? '',
        max: Number((it as Record<string, unknown>).max ?? 0),
        credit: (it.credit ?? []).map(c => ({
          pts: c.pts ?? null, reported: Boolean(c.reported), gates: Boolean(c.gates),
        })),
      // BY ID, as python's `sorted(items.items())` is -- the rubric's own order
      // is the natural one here and is not python's.
      })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      // SORTED BY CELL, as python's `sorted(CORRECTED_GOLD.items())` is. The
      // rule sorts too, so the findings agreed either way -- but a payload that
      // differs is a payload nobody can compare.
      corrections: decodeTable(gold(ns).CORRECTED_GOLD).map(({ key, value }) => {
        const cell = Array.isArray(key) ? key : [String(key), 0];
        const v = (value ?? {}) as Record<string, unknown>;
        return { item: String(cell[0]), pid: Number(cell[1]), score: Number(v.score) };
      }).sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : a.pid - b.pid)),
    };
  },

  // IN RUBRIC ORDER, item then credit then desc-before-rule, which is the order
  // python's three nested loops produce and therefore the order of the findings.
  no_judging_field_states_what_a_verdict_costs: (ns) => ({
    fields: readRubric(rubricPath(ns)).flatMap(it =>
      (it.credit ?? []).flatMap(c =>
        (['desc', 'rule'] as const)
          .filter(f => c[f])
          .map(f => ({ item: it.id, what: c.what, field: f, text: String(c[f]) })))),
  }),

  probed_fields_keep_their_text: (ns) => {
    const receipts = (((readJson(metadataFile(ns, 'PROBE_RECEIPTS.json')) as
      Record<string, unknown>)?.receipts ?? []) as Array<Record<string, unknown>>)
      .map(r => ({ item: String(r.item), slot: String(r.slot), sha: String(r.sha),
                   verdict: (r.verdict ?? null) as string | null }));
    const decl = (courseJson(ns).declarations ?? {}) as Record<string, unknown>;
    const designed = decodeTable(decl.DESIGNED_TEXT).map(({ key }) =>
      (Array.isArray(key) ? key.map(String) : [String(key), '', '']) as [string, string, string]);
    const shas = ((readJson(metadataFile(ns, 'DESIGNED_TEXT_SHA.json')) as
      Record<string, unknown>)?.fields ?? {}) as Record<string, unknown>;
    return { receipts, designed, shaOnly: Object.keys(shas).length - designed.length };
  },

  maps_tables_are_attached: (ns) => ({
    entries: readRubric(rubricPath(ns))
      .filter(it => (it.kinds.maps ?? []).length)
      .map(it => ({ handout: formOf(ns, it.id), item: it.id, inSpec: true, attached: true }))
      .sort((a, b) => (a.item < b.item ? -1 : 1)),
  }),

  // FROM THE RUBRIC ITSELF, read with `readRubric`. The `kinds` map is what the
  // collision check compares, and it keeps nulls: a rule of one kind that
  // declares no key is a fault this check exists to see, and filtering it would
  // turn that fault into agreement.
  computed_rules_do_not_share_a_key: (ns) => ({
    items: readRubric(rubricPath(ns)).map(it => ({
      handout: formOf(ns, it.id), id: it.id,
      kinds: {
        forbid: it.kinds.forbid ?? [],
        expect: it.kinds.expect ?? [],
        equals: it.kinds.equals ?? [],
        derived: it.kinds.derived ?? [],
      },
    })),
  }),
};

/**
 * The authored rubric component for one course.
 *
 * THROUGH THE CONTENT MOUNT, which is how lo-blocks already reaches a course:
 * `content/<ns>` is the course, symlinked or checked out. Asking `courseDir`
 * would not work -- it serves the two DATA roots, and the rubric is part of the
 * course itself, not of its records. This also means an unmounted course has no
 * rubric path rather than a guessed one.
 */
/**
 * The EXPANDED rubric -- what the scorer reads, and what carries the comments.
 *
 * NOT the authored file. `materialiseRubric` expands `<ItemTemplate>` during
 * the build, so the authored copy may carry template grammar and the staged one
 * never does; reading the authored file would mean implementing that grammar a
 * second time, which is the drift this package exists to end.
 *
 * BY SHAPE, NOT BY NAME, like `rubricPath`: the collection directory and the
 * rubric filename are the course's, so both are taken from the authored path
 * rather than spelled here. `COURSE_RUBRIC_OLX` overrides, which is the escape
 * a course uses to say "my rubric is THAT file" -- the stub course ships its
 * rubric beside its `course.json` and is never staged at all.
 */
/** Every file under a directory, recursively -- python's `rglob("*")`. */
function walkFiles(
  dir: string, acc: string[] = [], skipDirs?: ReadonlySet<string>,
): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    // PRUNED, NOT FILTERED AFTERWARDS. A repo-wide walk that descends into
    // `.git` and `node_modules` and discards the results reads hundreds of
    // thousands of files to answer a question about a few hundred. Python
    // prunes in `os.walk` by rewriting `dirnames`; this is that, and callers
    // passing nothing get the unpruned walk they had.
    if (st.isDirectory()) {
      if (skipDirs?.has(e)) continue;
      walkFiles(full, acc, skipDirs);
    } else acc.push(full);
  }
  return acc;
}

/** Read a file, or '' on any error -- python's `errors="replace"` walk. */
function readOrEmpty(f: string): string {
  // THE REFUSAL IS OUTSIDE THE `try`, deliberately. This reader swallows every
  // error into '', which is exactly how a forbidden read would become a silent
  // empty result -- the failure mode the whole records arrangement exists to
  // remove. A raw document must THROW here, not return nothing.
  refuseRawDocument(f);
  try { return readFileSync(f, 'utf8'); } catch { return ''; }
}

/**
 * The handout `.olx` STEMS in a collection, by the pattern it DECLARES.
 *
 * `handout_olx` is a `%d` TEMPLATE -- `bmod_handout%d.olx` -- so the match is
 * derived from it rather than written twice and drifting. A literal spelled
 * here would put one course's filenames back into the engine, which is what
 * `manifest.yaml` exists to end; two helpers in this file did exactly that.
 *
 * NO REGEX BUILT FROM THE PATTERN. Escaping a course-supplied string into a
 * character class is a second thing to get wrong for no gain -- prefix, suffix
 * and "digits between" is the whole grammar of a `%d` template.
 */
function handoutStems(ns: string, names: string[]): string[] {
  const pattern = collectionDeclares(ns, 'handout_olx');
  if (!pattern) return [];
  const stem = (f: string) => f.replace(/\.olx$/i, '');
  const at = pattern.indexOf('%d');
  if (at < 0) return names.filter(f => f === pattern).map(stem);
  const pre = pattern.slice(0, at);
  const post = pattern.slice(at + 2);
  return names.filter((f) => {
    if (!f.startsWith(pre) || !f.endsWith(post)) return false;
    const mid = f.slice(pre.length, f.length - post.length);
    // ANY characters, NOT just digits, because that is what python matches:
    // it derives its glob by replacing `%d` with `*`. The template MEANS a
    // number and digits-only would be the more faithful reading of it -- but
    // python is the reference here, and a stricter match would be a silent
    // divergence on a collection that ships `..._handoutX.olx`. Measured on
    // this course: both readings select the same three files.
    return mid.length > 0;
  }).map(stem);
}

/** One handout's declared filename, or '' when the collection declares none. */
function handoutName(ns: string, form: number | string): string {
  const pattern = collectionDeclares(ns, 'handout_olx');
  return pattern ? pattern.replace('%d', String(form)) : '';
}

/**
 * The built-page payload, for an EXPLICIT pair of roots.
 *
 * Split out of the assembler so it can be aimed at a fixture tree.
 * `loBlocksRoot()` walks up from this module's own location and is not
 * overridable, so an assembler that called it directly could only ever be
 * tested against the real tree -- where EVERY branch of this check is silent.
 * A payload builder certified on clean data alone is certified on nothing.
 */
export function builtPagePayload(lo: string, olxDir: string, ns: string) {
  const srcOlx = olxDir && existsSync(olxDir)
    ? readdirSync(olxDir).filter(f => f.toLowerCase().endsWith('.olx'))
    : [];
  let newestSrc = 0;
  for (const f of srcOlx) {
    try { newestSrc = Math.max(newestSrc, statSync(join(olxDir, f)).mtimeMs / 1000); }
    catch { /* a file that vanished mid-walk is not this check's finding */ }
  }
  const stagedNames = new Set(walkFiles(join(lo, '.stage', 'content'))
    .filter(f => f.toLowerCase().endsWith('.olx'))
    .map(f => basename(f)));
  // ONE DIRECTION ONLY, and SORTED, as python's `sorted(set - set)` is.
  const missingFromStage = srcOlx.filter(f => !stagedNames.has(f)).sort();
  // The handout STEMS, of which python tests only the FIRST.
  const ours = handoutStems(ns, srcOlx);
  const roots = ([
    ['.stage/content', "the resolver's staged output"],
    ['apps/static/public/static-content', 'the JSON the page loads'],
  ] as Array<[string, string]>).map(([rel, what]) => {
    const root = join(lo, rel);
    if (!existsSync(root)) {
      return { rel, what, exists: false, newestBuilt: 0, containsOurs: false,
               hits: [] as string[] };
    }
    const files = walkFiles(root);
    let newestBuilt = 0;
    for (const f of files) {
      try { newestBuilt = Math.max(newestBuilt, statSync(f).mtimeMs / 1000); }
      catch { /* likewise */ }
    }
    // WHAT CAN ACTUALLY REACH A PAGE: `.olx` is rendered and `.json` is what
    // the page loads. A `.md` in the staged tree is repo documentation that is
    // never served, and flagging it would report a file that cites the corpus
    // in prose ON PURPOSE as a rendering failure.
    const servable = files.filter(
      f => ['.olx', '.json', '.xml'].includes(extname(f).toLowerCase()));
    const first = ours[0];
    const containsOurs = !first || servable.some(
      f => basename(f).includes(first)
        || readOrEmpty(f).slice(0, 200000).includes(first));
    const hits: string[] = [];
    for (const f of servable) {
      // THE OLX FORM ONLY. `[[corpus ...]]` is the PROSE form and is correct in
      // a rubric or a note; `{{corpus:...}}` is the one that must be resolved
      // before anybody sees it.
      if (readOrEmpty(f).includes('{{corpus:')) hits.push(relative(root, f));
    }
    // SORTED, AND THIS DIVERGES FROM PYTHON ON PURPOSE. The rule names the
    // first EIGHT hits then "and N more", so the ORDER decides which eight a
    // reader is told about. Python takes them in `rglob` order -- raw
    // filesystem order, 5,0,1,3,7,6,8,4 on the fixture -- so WHICH eight it
    // names is an artefact of inode layout and would differ on another disk.
    // Node's `readdirSync` sorts, so the two can never agree, and matching
    // python would mean reproducing an order python does not mean.
    //
    // Sorting makes it reproducible: the same ten files always name the same
    // eight. The SET and the COUNT are unchanged, so nothing the check DETECTS
    // moves -- only which of an over-long list is printed.
    hits.sort();
    return { rel, what, exists: true, newestBuilt, containsOurs, hits };
  });
  return {
    loExists: true, loPath: lo, newestSrc,
    olxDirName: basename(olxDir), missingFromStage,
    stageHasNames: stagedNames.size > 0, roots,
  };
}

/**
 * Verdicts the SHEET declares for one slot, or null when the slot is not there.
 *
 * `enforcement._olx_slot_verdicts`. NULL AND EMPTY ARE DIFFERENT ANSWERS: an
 * empty set means "this slot offers the defaults and nothing else" -- the sheet
 * SPEAKING -- while null means the slot was never found. Conflating them makes
 * the caller fall back to the rubric, which is the side already known to be
 * wrong; that conflation is the fault E52 exists to stop and it was
 * reintroduced once already.
 */
export function olxSlotVerdicts(ns: string, itemId: string, slot: string):
    string[] | null {
  const grader = String((jobs(ns)[itemId] ?? {}).grader ?? '');
  if (!grader) return [];
  const act = grader.replace('_grader', '_llm');
  const blob = handoutBlob(ns);
  const re = new RegExp(
    '<LLMAction\\b(?:(?!</?LLMAction)[^>])*?(?:^|\\s)id="'
    + act.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // NO `s` FLAG: `[^>]` and `[^"]` already match a newline, and dotAll is
    // not available at this compile target.
    + '"(?:(?!</?LLMAction)[^>])*>');
  const m = re.exec(blob);
  if (!m) return null;
  const sm = /slots="([^"]*)"/.exec(m[0]);
  for (const part of (sm ? sm[1].split('|') : [])) {
    const bits = part.split(':');
    if (bits[0].replace(/^!+/, '').trim() !== slot) continue;
    const out = new Set<string>();
    for (const b of bits.slice(2)) {
      for (const tok of b.split('/')) {
        const t2 = tok.replace(/@[0-9.]+$/, '').trim();
        if (t2) out.add(t2);
      }
    }
    return [...out];                      // may be EMPTY: the sheet spoke
  }
  return null;                            // the slot was never found
}

/**
 * One stage tree's copy of the authored rubric: `.stage/<kind>/<ns>/<tail>`.
 *
 * MIRRORS python's `rubric_component._staged_under`, including its fix. Both
 * sides once built the tail as `<collection>/<rubric>`, which assumed the
 * rubric sits directly in the collection -- true until this course's material
 * moved into a folder of its own and both paths started naming a file one
 * directory above the real one. THE TWO SIDES MUST AGREE ON WHERE A STAGED
 * FILE IS, so the tail is DERIVED here exactly as it is there.
 */
export function stagedUnder(ns: string, kind: string): string {
  const root = loBlocksRoot();
  if (!root) {
    throw new Error(
      'enforce/native: the lo-blocks root could not be found, so no course ' +
      'content can be located');
  }
  const authored = rubricPath(ns);
  // THE TAIL IS THE AUTHORED PATH RELATIVE TO THE MOUNT, not the last
  // directory plus the filename. The stage mirrors the mounted tree, so
  // `content/<ns>/a/b/x_rubric.olx` stages at
  // `.stage/expanded/<ns>/a/b/x_rubric.olx`; `basename(dirname(...))` keeps
  // only `b`, which was right solely while every rubric sat exactly one
  // directory inside its mount. When this course's material moved into a
  // folder of its own on 2026-09-26 the built path lost its `psychology/`
  // segment and four rules failed with ENOENT -- the good outcome, since the
  // alternative shape of this bug is a path that exists and is the wrong
  // file. python's `rubric_component._staged_under` had the identical bug and
  // the identical fix; the two sides must agree on where a staged file is.
  const mount = join(root, 'content', ns);
  let tail: string;
  try {
    tail = relative(realpathSync(mount), realpathSync(authored));
  } catch {
    tail = relative(mount, authored);
  }
  if (!tail || tail.startsWith('..')) {
    // Not under the mount at all: the filename alone, rather than a path
    // built to point outside the stage.
    tail = basename(authored);
  }
  return join(root, '.stage', kind, ns, tail);
}

/**
 * python's `rubric_component.expanded_path()` -- the template-expansion tree.
 *
 * THE OVERRIDE LIVES HERE AND NOT ON THE STAGED COPY, because python's
 * `staged_path()` has none: adding one would give this side an escape the
 * audit of record does not have.
 */
export function expandedRubricPath(ns: string): string {
  const override = process.env.COURSE_RUBRIC_OLX;
  if (override) return override;
  return stagedUnder(ns, 'expanded');
}

/**
 * python's `rubric_component.staged_path()` -- the build's RESOLVED copy, with
 * templates already expanded. A reader that went to the AUTHORED file instead
 * would have to understand the template grammar, and that second
 * implementation of one rule is the drift this whole model exists to end.
 */
export function stagedRubricPath(ns: string): string {
  return stagedUnder(ns, 'content');
}

export function rubricPath(ns: string): string {
  const root = loBlocksRoot();
  if (!root) {
    throw new Error(
      'enforce/native: the lo-blocks root could not be found, so no course ' +
      'content can be located');
  }
  // BY SHAPE, NOT BY NAME. This spelled the collection directory AND this
  // course's rubric filename -- while `courseData.declaredRoot`, thirty lines
  // away, finds the same file by shape and says why: "naming the file would put
  // a course's filename back into the engine". Ten assemblers read this path.
  const rubric = rubricFile(ns);
  if (!rubric) {
    throw new Error(
      `enforce/native: ${ns} is mounted but no *_rubric.olx was found in its ` +
      `content collection, so no rule can read its rubric`);
  }
  return rubric;
}

/**
 * Rules that cannot yet be fed natively, each naming WHAT IS MISSING.
 *
 * A reason is a python DERIVATION that has no TypeScript counterpart — not an
 * excuse. Naming it turns "someone should look at this" into a work item, and
 * keeps the coverage check from passing on silence.
 */
// Subgoal E63. The runner can assemble its own payload -- that is the point of
// the goal, because it lets a ported check's python side shrink to one line --
// but it may only do so for a rule where the assembler has been SHOWN to build
// what python builds. Measured 2026-09-25, comparing every assembler's output
// against the payload python actually sends:
//
//     10 identical        <- after two assembler bugs were fixed
//     4  identical once ordering is normalised
//     7  GENUINELY DIFFERENT -- same keys, different data
//     4  no assembler at all
//
// ORDER-ONLY IS NOT ENOUGH, and four names were removed from this list for
// falling short of it. "The findings agree" proved nothing: EVERY rule returns
// [] on today's data, so both sides agreed by being empty -- the same
// both-read-zero trap this package keeps relearning. A mutation that would make
// the rules FIRE could not be constructed generically, so order-insensitivity
// is UNPROVEN and those rules keep their python fetch until it is proven.
// `gold_tables_have_no_duplicate_keys` was removed for a plainer reason: it is
// not a rule in RULES at all.
//
// SO THIS IS AN ALLOWLIST, NOT A FLAG. Self-assembling the nine that differ
// would feed the rule other data than the audit feeds it, and every one of
// them would still "agree" with python -- which is the exact failure goal K
// already hit when three assemblers returned empty and agreed with zero. The
// nine are named in the goal entry as the work that earns them a place here.
//
// IT RATCHETS UPWARD ONLY BY MEASUREMENT: a name is added when the comparison
// test says its payload equals python's, never because it looks right.
export const SELF_ASSEMBLING: ReadonlySet<string> = new Set([
  // PORTED AND CLEARED 2026-09-28. Both projections were compared against THE
  // PAYLOAD PYTHON ACTUALLY SENDS, captured by wrapping the bridge: 23 rows,
  // identical `sheetKeys` and `rubricDef` on every one, and the rubric side
  // identical to `rubric_component.load()`'s keys across all 26 items.
  // PROVEN ON FIRING DATA, not just at rest: with one `<Slot>` removed from a
  // COPY of the staged rubric, both readers moved the same way and the rule
  // produced exactly one finding naming the dropped key. Agreement at zero was
  // never the evidence.
  'sheet_matches_rubric',
  // PORTED 2026-09-27, self-assembling from the start: python hands no payload
  // because there is nothing for it to hand. The rule asks where three files
  // are -- the generic half beside these rules, the course half under the
  // rubric, the composed copy readers open -- and the assembler answers from
  // the tree. A payload from python would be python's view of the same
  // filesystem, which is a second reading, not a check.
  'every_document_is_where_its_readers_look',
  // Same reason: the assembler reads both halves off the tree.
  'no_composed_document_repeats_itself',
  // Same again: the three texts come off the tree, not from python.
  'composed_documents_are_current',
  // The rubric, the handouts and the course file are all on the tree.
  //
  // NATIVE-ONLY, AND PYTHON MUST PASS A PAYLOAD. Being on this list means the
  // runner CAN build this rule's payload, not that every caller should let it.
  // `enforcement.check_derived_fields_resolve` asked with `null` and the
  // assembler read `refs` from the course record ON DISK -- while the
  // enforcement self-test injects by popping a field from
  // `agreement.BLOCKS[...]["refs"]` IN MEMORY. The mutation was invisible, the
  // rule answered clean, and the case reported NOTHING FIRED (2026-09-27).
  // Python assembles and passes now; this entry stays so `auditContent.ts`,
  // which has no python to ask, keeps the rule at build time.
  // ADDED 2026-09-27, when the RUN ARCHIVE reader moved here. Its payload was
  // python's for one reason -- python held the only reader -- and the archive
  // is JSON on disk. PROVEN, not assumed: the native assembler builds the same
  // 26 rows python passes, field for field, which is what earns a place here.
  'web_code_is_stamped',
  // ADDED 2026-09-27. Its first native walk found HALF the artifacts, because
  // it globbed one level -- the same bug `_runs_files` was written to end, and
  // the one that once made a correctly-stamped sweep of all 26 items invisible.
  // The walker covers both layouts now, and the payload is identical over all
  // 104 artifacts.
  'count_scaffolds_are_arithmetic',
  'derived_fields_resolve',
  'ref_targets_resolve',
  'no_recorded_run_is_an_api_error',
  'citation_necessity_is_recorded',
  'convertible_prose_rules_have_subgoals',
  'consensus_fixes_have_no_duplicate_cells',
  // ADDED AFTER RECONCILIATION, 2026-09-25. Six became payload-IDENTICAL once
  // three assembler defects were fixed -- two writing `handout: null`, one
  // emitting `{cell:[item,pid]}` for a rule that reads `.item`/`.pid` -- and
  // one carrying a `count` key no rule reads. Two more are order-only and
  // proven on firing data with targeted mutations.
  // Became identical when PYTHON changed: it was sending the replacement
  // SPAN of each fix -- student sentences the rule never reads -- and now sends
  // only the kind and the box. 13 KB of student writing per audit stopped
  // crossing the bridge as a side effect of making the two payloads agree.
  'consensus_fixes_are_unique',
  // The ASSEMBLER was the better side here. Python sent `offered: null` for
  // a slot whose sheet offers only met/absent, because its helper returned an
  // empty set both for 'not found' and for 'offers nothing extra' -- and the
  // rule falls back to the RUBRIC's list on null, which subgoal E52 records as
  // having let a fault survive a whole sweep. Python now distinguishes the two.
  'mapped_slots_have_no_unreachable_verdict',
  // PROMPT SOURCE DIFFERS BY DESIGN and the rules do not care. Python REBUILDS
  // the prompt; the assembler reads the SHIPPED body from the .olx, so the two
  // differ in reference rendering (REF:id:target against <Ref id=.../>) and
  // leading whitespace. Proven immaterial on firing data: planting a case name
  // in every prompt gives 23 findings on both sides, same set; wiping one
  // designed entry's prompt at a time agrees on all four.
  'every_designed_entry_ships',
  'no_case_names_in_prompts',
  // WAS `NATIVE_BLOCKED`, and the blocker had gone stale: it said porting the
  // verdict vocabulary would make a THIRD copy, which stopped being true when
  // `verdictVocabulary.ts` became the single source and python started
  // reading it. Order-only against python's payload -- 217 slots, same set --
  // and proven on firing data: an unoffered verdict planted in every note
  // gives 213 findings on both sides, identical.
  'prompt_prose_names_only_offered_verdicts',
  // WAS `NATIVE_BLOCKED` on effort, not possibility: two of its three inputs
  // were already reachable (families from the rubric's `<Item family=...>`,
  // the budget from course.json) and the third was a python literal, which
  // E63 moved to the course file. Payload IDENTICAL on the first attempt --
  // budget, divergences and families all -- and fired identically when one
  // item's gate is flipped, the control the original port used.
  'sibling_slots_share_their_structure',
  // Payload IDENTICAL to python's, and byte-identical findings on two firing
  // controls: an orphan code and a ghost declaration, 18 findings each.
  'codes_reachable',
  // Payload identical to python's and findings identical on two firing
  // controls -- a counted family un-counted, and a counted family given a
  // second code -- 4 findings each.
  'countable_families_converted',
  'exclusion_claims_are_data',
  // Payload built from the collection's manifest, which now DECLARES the
  // filenames python used to default to. Same four wanted links; removing one
  // produces the same finding.
  'the_course_links_the_rubric_and_every_form',
  // Payload identical after two fixes the comparison forced: the corrections
  // and items are now sorted as python sorts them, and `pts=""` parses to null
  // rather than 0. Findings identical on an off-grid control, 15 each.
  'gold_corrections_land_on_attainable_scores',
  'carried_notes_are_intact',
  'slot_codes_exist',
  'no_unresolved_reference_reaches_the_page',
  'one_writer_per_computed_key',
  'verdict_vocabularies_correspond',
  'every_failing_verdict_has_a_charge',
  'pick_choices_match_rubric',
  'olx_corpus_references',
  'rubric_slots_reach_the_sheet',
  'sheet_slots_reach_the_rubric',
  'the_expanded_rubric_is_current',
  'slot_rules_are_vocabulary_neutral',
  'prompt_deviation_tables_are_current',
  'gold_scores_are_attainable',
  'gold_tables_have_no_duplicate_keys',
  'corrected_gold_matches_the_sheet',
  'enumerated_slots_cover_the_rubric',
  'citations_match_exclusions',
  'no_declaration_cites_a_suspect_cell',
  'shipped_text_matches_design',
  'every_prompt_field_is_designed',
  'fails_verdict_is_mirrored_in_the_app',
  'gold_columns_are_the_item_labels',
  'action_attributes_are_declared_in_the_block',
  'olx_attributes_are_all_generated',
  'response_fixtures_are_intact',
  'consensus_spans_are_disjoint',
  'fixture_agrees_with_gold',
  'rule_examples_are_not_corpus',
  'records_carry_no_machine_path',
  'prose_only_claims_are_current',
  'primitive_conformance',
  'response_boxes_are_bounded',
  'probe_receipts_match_shipping',
  'new_slots_were_probed',
  'written_rules_reach_the_shipped_prompt',
  // 146 fields, payload identical. Every one of the pattern's nine
  // alternatives fires, and 'worth 3 of 5' -- the SCALE, not a cost -- is
  // correctly spared by the lookahead. Finding text identical on two planted
  // cases.
  'no_judging_field_states_what_a_verdict_costs',
  // Findings identical where they render. The one divergence is deliberate
  // and corrective: python's message hardcoded "the other 145" from a file that
  // now holds 146 fields, and the assembler derives the count instead. The
  // message renders only for a receipt whose text is unrecorded -- none is --
  // so nothing observable moves.
  'probed_fields_keep_their_text',
  'computed_rules_do_not_share_a_key',
  'handsplit_rows_are_disjoint',
  'maps_tables_are_attached',
  'no_cell_is_both_corrected_and_declared',
  'no_recorded_run_is_verdictless',
  'parked_entries_still_apply',
  'prompts_carry_no_process_history',
  'verdict_spaces_are_declared',
  // ORDER-ONLY, AND PROVEN SO ON DATA THAT FIRES. Their payloads differ from
  // python's only in the order of a top-level collection. That was NOT enough
  // on its own -- every rule returns [] on today's data, so "the findings
  // agree" is two empties agreeing. Each was therefore mutated until it
  // produced findings (1, 7 and up to 28 of them) and the collection
  // permuted: the finding SET is unchanged in every firing case.
  //
  // THE FIRST ATTEMPT AT THIS PROOF WAS WRONG and is worth recording: it
  // reversed NESTED arrays too, which turned the pair ['Q6','link_c2'] into
  // ['link_c2','Q6'] and reported order-sensitivity that was the test's own
  // corruption. A nested array here is a TUPLE, not a set.
  'every_reference_has_the_data_that_resolves_it',
  'named_fixtures_still_name_something',
  'prose_only_slots_are_declared',
  'every_item_has_a_findable_slot_sheet',
  'gold_shared_prose_has_not_drifted',
  'recorded_sides_are_readable',
  'rubric_items_are_unique',
]);

export const NATIVE_BLOCKED: Record<string, string> = {
  divergence_arithmetic_is_still_true:
    'needs `enforcement._maxes`, which computes a slot sheet\'s web max against ' +
    'its rubric max the way the SCORER does; the declaration being checked is a ' +
    'claim about those two numbers, so they must come from the same reader that ' +
    'produced the claim.',

  rule_fail_tokens_agree:
    'needs `score._fail_verdict`, which renders `{fail}` into the PAPER prompt: ' +
    'the paper generator stays in python, and what that token becomes there is ' +
    'exactly the thing under comparison.',

  paper_prompt_has_no_box_deixis:
    'needs `score.build_prompt`, the paper prompt generator, which stays in ' +
    'python: the shipped paper prompt IS the artifact under test, so ' +
    'assembling it here would check a prompt this engine built rather than ' +
    'the one that ships.',


  generated_attributes_have_a_declaration:
    'MEASURED 2026-09-25, and the measurement is the reason to be careful. The ' +
    'payload is 125 rows over 16 attributes, and `backed` is FALSE in exactly ' +
    'ONE place: `because`, backed on 4 of the 8 sheets that carry it. Every ' +
    'other attribute is backed wherever it appears -- so FIFTEEN OF SIXTEEN ' +
    'DERIVATIONS COULD BE WRITTEN AS `return true` AND MATCH TODAY EXACTLY. A ' +
    'port verified against this corpus alone would prove almost nothing, which ' +
    'is the both-read-zero trap in another form. THE STANDARD A PORT MUST MEET: ' +
    'the 125-row boolean matrix matches AND each derivation is shown to read ' +
    'the rubric, by removing the material it derives from and watching `backed` ' +
    'go false. Until that is done the original reason still stands -- ' +
    'needs `olx_prompts.*_attr_for` -- the EXTRACTION half of the sixteen ' +
    'attribute generators. The ' +
    'FORMATTING half is already here -- `attributeAssembler.slotsAttr`, ' +
    '`mapsAttr`, `countsAttr` and the rest -- but each takes a RULES array, ' +
    'while python\'s `*_attr_for(item_id)` also derives those rules from the ' +
    'rubric, and `backed` is exactly "did that derivation produce anything". ' +
    'The conditions are per generator and not guessable: `rubricDefAttr` ' +
    'returns the id unconditionally here, yet python reports it backed for 23 ' +
    'of 26 items. Sixteen extraction rules, each able to be quietly wrong -- ' +
    'the shape of error that took five fixes on verdict_spaces_are_declared.',
  probe_unreachable_pairs_still_apply:
    'BLOCKED BY A BOUNDARY, not by missing work, and the earlier reason ' +
    '("needs `cli_signatures`, not a file this package can read") was true but ' +
    'incidental. THE SUBJECT IS THE PAPER SCORER. `cli_signatures` is a ' +
    'BEHAVIOURAL probe: it fails one slot, then two, and reads the arithmetic ' +
    'off the scorer python runs — and since goal O eliminated the python web ' +
    'mirror, the only scorer python runs is the PAPER one. The declarations it ' +
    're-tests are pairs the WEB states outright that the PAPER-side probe ' +
    'cannot discover, so the whole subject is an asymmetry between the two ' +
    'engines. A comparable web probe would not unblock it: it would measure ' +
    'the side that already declares them, and the gap would vanish by ' +
    'construction rather than by being closed. Porting the paper scorer here ' +
    'to run the probe natively would be worse — `score.py` records real ' +
    'paper-unique behaviour ("the paper path is handed the assembled response ' +
    'TEXT, not the page ... a real platform limit"), so a copy would either ' +
    'reproduce limits this side does not have or quietly diverge. ' +
    'PAPER-UNIQUE STAYS PYTHON (user, 2026-09-25). The alternative considered ' +
    'and not taken: python could RECORD the signatures for this side to read, ' +
    'which buys native callability at the cost of judging a recorded product ' +
    'that can go stale — a bad trade for a rule whose subject python owns.',
  goals_record_is_intact:
    'needs `goals._before`, which reads the COMMITTED prior ledger with ' +
    '`git show HEAD:GOALS.md`. A rule that shells out behaves differently ' +
    'under a build, a hook and a test, so python reads it and passes it; a ' +
    'missing baseline travels as `before: null` and is REPORTED rather than ' +
    'passed over, which is the distinction rules 3 and 4 depend on',
  system_prompts_are_parallel:
    'needs `score.SYSTEM_TMPL`, the PAPER scorer\'s system prompt, which is a ' +
    'python constant. Python is one of the two voices this rule compares, so ' +
    'it holds both prompts, splits them into numbered rules and passes them; ' +
    'a native assembler could read only the web half and would compare it ' +
    'against nothing',
  designed_text_is_the_measured_text:
    'needs `corpus_resolve.expand`, which resolves a `{{corpus:...}}` ' +
    'reference against the RESPONSE RECORDS before the field is hashed. ' +
    'Since the history rewrite a design that quotes a student holds the ' +
    'reference where the registered text held the sentence, and hashing it ' +
    'raw reported seven unchanged fields as CHANGED across three handouts',
  property_vocabulary_ratchet:
    'needs `property_ratchet.scan`, which AST-parses the engine\'s own python ' +
    'modules to find the subscripts that branch on a course property. The ' +
    'scan is narrow on purpose -- subscripts only, because `coursedata` hands ' +
    'out dicts -- and its premise is checked separately in python',
  course_schema_fields:
    'needs `coursedata._load` AND `coursedata.items`, which serve the two ' +
    'halves of the 3d split -- the generator\'s rows and the rubric ' +
    'component\'s. Comparing against `items[]` alone reported all 28 rubric ' +
    'names as stale declarations, which is the opposite of true',
  course_schema_cleanups:
    'needs `coursedata._load` and `coursedata.items`, for the reason ' +
    '`course_schema_fields` records: both halves of the 3d split or the ' +
    'stale-declaration list is nonsense',
  peg_formats_declared:
    'needs `olx_corpus.default_roots` and `peg_formats.course_files`, which ' +
    'walk the COURSE roots for authored peg content. The registry half is the ' +
    'engine\'s and could be read here; the file census is not',
  cli_sends_the_apps_prompt:
    'needs `agreement.checklist_guidance`, the python MIRROR whose composed ' +
    'order this compares against the app\'s. A native assembler could read ' +
    'slotSheet.ts and would have nothing to compare it to',
  engines_offer_same_verdicts:
    'needs `olx_prompts.parse_slots` AND `agreement.load_action` -- each ' +
    'engine\'s verdict list must come through ITS OWN reader, or the ' +
    'comparison is one reader agreeing with itself',
  paper_prompt_is_stamped:
    'needs `measured.prompt_sha` for BOTH sides. One half is IMPOSSIBLE here ' +
    'and the other is merely WRONG to recompute, and the difference matters. ' +
    'The paper sha hashes `score.fingerprint_text`, python\'s paper scorer, ' +
    'which has no counterpart on this side. The OLX sha could be computed ' +
    'natively -- it is just the served .olx -- and doing so would BREAK THE ' +
    'CHECK: its subject is one function returning the SAME value for two ' +
    'different `side` arguments, which is the bug it caught (no paper branch, ' +
    'so the web hash came back for both). Two independently computed shas ' +
    'would differ for implementation reasons, the equality would never fire, ' +
    'and the borrowed stamp would go undetected',
  paper_reproduces_web_scores:
    'needs `measured.web_judgments_through_paper`, which re-runs every ' +
    'recorded WEB judgment through `score.py`\'s arithmetic. The paper ' +
    'scorer is python; running its arithmetic is the measurement, and there ' +
    'is nothing on this side to run it with',
  ask_equivalences_still_hold:
    'needs `measured.ask_sha`, which re-derives the QUESTION an item asks on a ' +
    'given side. The declared half is a literal in the table and could be read ' +
    'here; the derived half cannot, and a row judged against only its own ' +
    'literal would agree with itself',
  items_measured_as_configured:
    'needs `measured.status`, which compares each recorded number against the ' +
    'CURRENT prompt fingerprint and cell set, per side. Both halves of that ' +
    'comparison live in the run archive and the ledger; the tree holds only ' +
    'one of them',
  every_sweep_is_recorded:
    'needs `measured.entry`, `measured._runs_path` and `measured.SIDE_CONTRACT` ' +
    'plus a walk of the run archive. It dates artifacts by `era.measured_at` -- ' +
    'when the GRADER ran -- and falls back to mtime only when there is no ' +
    'stamp, because preferring mtime once made a pooled artifact containing a ' +
    'failed cell-fill look newer than the clean measurement it superseded',
  probe_reach_limits_still_apply:
    'needs `agreement.load_action` and `measured._computed_slots` -- the ' +
    'harness\'s reading of the sheet, and its notion of which keys the scorer ' +
    'DERIVES rather than asks. The shape facts are computed from those two, ' +
    'and computing them from a second reading would test a different sheet',
  mapped_slots_agree_with_their_map:
    'needs `measured.slot_answer` and `measured.slot_verdict` plus a walk of ' +
    'the RUN ARCHIVE. They are the canonical readers, not a hand-rolled ' +
    'lookup: a python result stores a pick\'s value in `answers` and an EMPTY ' +
    'STRING for the same key in `checks`, and only `slot_answer` tries the ' +
    'pick fields first. The archive is not reconstructible from the tree',
  students_see_what_each_check_decided:
    'needs `measured.web_code_sha` and a walk of the RUN ARCHIVE reading the ' +
    'FEEDBACK TEXT each run rendered. What a student SAW is a fact about a ' +
    'recorded run; re-deriving it from today\'s code would report what they ' +
    'would see now, which is the opposite of the question',
  paper_feedback_explains_its_deductions:
    'needs `measured.paper_render_sha` and a walk of the paper RUN ARCHIVE. ' +
    'The fingerprint is score.py\'s own feedback wording -- the writer of ' +
    'every stamp being compared against -- and the artifacts are the record ' +
    'of what a student actually read',
  wrong_cells_without_an_owner:
    'needs `measured._wrong_cells` and `measured._live_subgoal_owners` -- ' +
    'which cells the recorded runs get wrong, and which OPEN subgoals name ' +
    'each one, per side. The first is the run archive and the second is the ' +
    'goals ledger read against it',
  prose_claims:
    'needs `measured.records` for EVERY recorded side and ' +
    '`measured._goals_record_lines`, which says which ledger lines are CLOSED ' +
    'entries and when each was written. The prose is on the tree; what it is ' +
    'checked against is the ledger, and a line\'s write date is git history',
  gold_slot_disagreements:
    'needs `measured._table_hits` and `measured._our_typical_failing_slots` -- ' +
    'the phrase table that maps a grader\'s written charge to slots, and the ' +
    'pooled run distribution it is compared against. Gold\'s comments and the ' +
    'recorded runs are both records; neither is on the tree',
  declaration_conflicts:
    'needs `measured.records` per side and the declaration tables themselves ' +
    '-- which cells are corrected, which diverge, which ceilings are ' +
    'unreachable, which are excluded. The claim is a prediction and the ' +
    'recorded runs are what tests it; neither is on the tree',
};

/** Run a rule natively for one course. Throws if it cannot be fed. */
export function runNative(rule: string, ns: string): unknown {
  const assemble = NATIVE[rule];
  if (!assemble) {
    const why = NATIVE_BLOCKED[rule] ?? ARGUMENT_FED[rule];
    throw new Error(
      why
        ? `enforce/native: ${rule} cannot be fed from inside lo-blocks yet — ${why}`
        : `enforce/native: ${rule} has no assembler and no declared reason, so ` +
          `nothing can say whether it is callable here`);
  }
  return assemble(ns);
}

/**
 * Assemblers that hand their rule NOTHING.
 *
 * THE FAILURE THIS EXISTS FOR, 2026-09-25. `decodeTable` handled the tagged
 * `{__dict__: ...}` form and not the BARE LIST OF PAIRS that most declarations
 * actually use, so three assemblers returned empty payloads. Every one of them
 * then "agreed" with python, because python found zero findings and a rule
 * handed nothing finds zero too. The agreement was real and worthless.
 *
 * A payload of zero rows is not proof of a clean course; it is proof of an
 * assembler that read nothing. Callers pass the rules whose tables are KNOWN to
 * be non-empty for this course, and anything reporting empty is a fault.
 */
/**
 * Rules whose INPUTS ARE ARGUMENTS, not facts about the course.
 *
 * `Assembler` is `(ns) => payload`: it is handed a NAMESPACE and must derive
 * everything else. These rules are not asked a question about a course -- they
 * are handed one (kind, item) pair, or two tables, and asked to reduce them.
 * There is nothing for an assembler to READ, so they can never enter
 * SELF_ASSEMBLING, and naming a python reader as their blocker MISLEADS: it
 * invites someone to port that reader and then find the rule still cannot
 * self-assemble. `web_code_sha` sat in NATIVE_BLOCKED saying it needed
 * `measured._web_parts` while `webParts()` was already here.
 *
 * THEY ARE NOT BLOCKED FROM TYPESCRIPT. What SELF_ASSEMBLING buys -- a
 * lo-blocks caller running the rule without python -- these already have by a
 * simpler route: the functions are exported and a TS caller calls them
 * directly. The tell that they are FUNCTIONS rather than checks is on the
 * python side, which takes element 0 and uses it as a VALUE:
 * `lo_enforce.run("web_code_sha", payload)[0]`.
 */
export const ARGUMENT_FED: Record<string, string> = {
  web_code_sha:
    'its inputs are ARGUMENTS: python calls it per (kind, item) -- ' +
    '`web_code_sha("ask", it)` and `("score", it)` for every item -- and takes ' +
    'the value, not findings. A TS caller calls `webCodeSha()`/`webParts()` ' +
    'directly; there is no payload to assemble from a namespace.',
  same_shape:
    'its inputs are ARGUMENTS: two tables to compare, handed in by the caller. ' +
    'Nothing about the course decides which two.',
};

export const LEGITIMATELY_EMPTY: Record<string, string> = {
  // AN EMPTY TABLE IS A REAL STATE, and this one is empty on this course:
  // `HAND_AUTHORED_ATTRS` has no entries, so an empty payload is the right
  // answer rather than an assembler that read nothing. Declared rather than
  // excluded quietly, because the day the table gains an entry this must stop
  // being true -- and a reader of the list should be able to check that.
  hand_authored_attrs_still_suppress_something:
    'HAND_AUTHORED_ATTRS is empty on this course: nothing is exempted, so ' +
    'there is nothing for the rule to judge',
};

export function emptyPayloads(ns: string, rules: string[]): string[] {
  const out: string[] = [];
  for (const rule of rules) {
    if (rule in LEGITIMATELY_EMPTY) continue;
    const assemble = NATIVE[rule];
    if (!assemble) continue;
    let payload: Record<string, unknown>;
    try {
      payload = assemble(ns) as Record<string, unknown>;
    } catch (e) {
      out.push(`${rule}: its assembler threw (${(e as Error).message})`);
      continue;
    }
    const rows = Object.entries(payload)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [k, (v as unknown[]).length] as const);
    if (rows.length && rows.every(([, n]) => n === 0)) {
      out.push(
        `${rule}: every list in its payload is empty (${rows.map(([k]) => k).join(', ')}), ` +
        `so the rule judged nothing. That agrees with python whenever python ` +
        `finds nothing, for entirely the wrong reason`);
    }
  }
  return out;
}

/**
 * Rules with neither an assembler nor a declared reason.
 *
 * Returns FINDINGS, empty when every rule is accounted for. The caller is the
 * test suite, so a rule added without either fails the build rather than
 * quietly becoming python-only.
 */
export function nativeCoverage(ruleNames: string[]): string[] {
  return ruleNames
    .filter(r => !(r in NATIVE) && !(r in NATIVE_BLOCKED) && !(r in ARGUMENT_FED))
    .map(r =>
      `${r} can be run from python but has no native assembler and no declared ` +
      `reason it cannot have one. Add one to NATIVE, or say in NATIVE_BLOCKED ` +
      `which derivation is missing — a rule only python can feed is a python ` +
      `test written in TypeScript`);
}


/**
 * The assembler for `rule`, and whether its payload has been CLEARED.
 *
 * ONE GATE, TWO POLICIES, BOTH STATED. The runner refuses anything uncleared,
 * because its caller is the audit of record. The build audit RUNS them and
 * LABELS them, because its job is to say as much as it can about the tree and
 * a refusal is information (QUALITY_CONTROL §2m).
 *
 * Before this each decided for itself, and they disagreed in the wrong
 * direction: the BUILD -- the context with the least supervision -- was the
 * more permissive, keying off `NATIVE[rule]` alone. It therefore ran
 * `ratchets_only_tighten` at build time, whose payload native.ts says is
 * "deliberately SHAPED DIFFERENTLY from python's": legitimate, but it means
 * "the build audit was green" does not imply "the python audit agrees on that
 * rule". That distinction is now reportable instead of invisible.
 */
export function assemblerFor(rule: string):
    { fn: Assembler | null; cleared: boolean; why: string | null } {
  const fn = NATIVE[rule] ?? null;
  return {
    fn,
    cleared: fn !== null && SELF_ASSEMBLING.has(rule),
    why: NATIVE_BLOCKED[rule] ?? ARGUMENT_FED[rule] ?? null,
  };
}
