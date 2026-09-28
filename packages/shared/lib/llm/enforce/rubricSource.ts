// Reading the authored rubric from inside lo-blocks, with no python.
//
// Goal K. Three ported rules need facts DERIVED from the rubric -- which slots
// a primitive computes, what each item in a family does with a slot -- and
// those derivations lived only in python, so the rules could be run from python
// and not from here. The user's requirement is that every rule be callable
// natively, so the rubric has to be readable natively.
//
// WHY NOT THE APP'S PARSER. `content/parseOLX` pulls in the app runtime
// (redux, lo_event) and does not resolve standalone; this package is spawned as
// a bare tsx process and has to stay light. `fast-xml-parser` is already a
// dependency and is enough: python reads the same file with
// `xml.etree.ElementTree`, so this is the same move, not a new one.
//
// DELIBERATELY PARTIAL. Python's item carries 37 distinct keys across the
// corpus; this reads only what the derivations need, and says so rather than
// pretending to be `rubric_component`. A reader that claimed completeness and
// quietly dropped a field would make a rule disagree with python about an item
// it had never heard of.

import { readFileSync } from 'node:fs';

import { XMLParser } from 'fast-xml-parser';

/** One credit component, as the derivations need it. */
export type Credit = {
  what: string;
  /** Prose the grader reads for this slot; scanned for leaks. */
  desc?: string;
  rule?: string;
  reported?: boolean;
  pts?: number | null;
  verdicts?: string[];
  /** verdict -> deduction code, as `codes="absent=UTB_NOT_STATED|..."`. */
  codes?: Record<string, string>;
  gates?: boolean;
  at?: number | null;
  /**
   * EVERY field of this component that a rule may look up BY NAME.
   *
   * The named fields above are the ones the derivations understand. A rule
   * reading a field by name -- `DESIGNED_TEXT` is keyed `(item, slot, field)`
   * and `field` is whatever the design named -- has a wider field space than
   * this type does, and a reader that knows only the named fields reports
   * nothing for a field it was never told about. Python reads its spec dict
   * with `.get(field)` and has no such blind spot; this closes it.
   *
   * NOT THE RAW ATTRIBUTE MAP, which is what it held for one draft. `desc` is
   * authored as the element's TEXT as often as an attribute, so a raw map was
   * missing it on the one slot in `DESIGNED_TEXT` that ships real prose -- the
   * reader looked, found nothing, and read that as "designed, not yet built".
   * Python's spec dict presents attributes and resolved content uniformly, and
   * so does this.
   */
  attrs: Record<string, string>;
};

/** One rubric item, partially materialised. */
export type RubricItem = {
  id: string;
  /** The `<LLMAction>`/`<DerivedChecks>` element this item's sheet lives on. */
  asks?: string;
  family?: string;
  credit: Credit[];
  /** Keys a primitive computes, by the primitive that computes them. */
  computed: Record<string, string>;
  /** The keys each primitive declares, per kind — a kind may repeat a key. */
  kinds: Record<string, Array<string | null>>;
  /** Keys a `Counts` group covers, its own key included. */
  counted: string[];
  /** Each `Counts` group's OWN key -- `counted` minus these is python's set. */
  countKeys?: string[];
  /**
   * `Counts` groups UNGROUPED, each with its own key and the slots it covers.
   *
   * `counted` and `countKeys` fold every group together, which is what their
   * readers want and is LOSSY for a check that reports per group: a name in two
   * groups is two findings in python and would be one here. Kept apart rather
   * than reconstructed, for the same reason `countKeys` is.
   */
  counts?: Array<{ key: string; slots: string[] }>;
  /** `Onlyif` rules: the charge suppressed, and the slot that suppresses it. */
  onlyif?: Array<{ key: string; cond: string }>;
  /**
   * `Equals` and `Expect` rules WITH THEIR OPERANDS.
   *
   * `kinds` records only which keys each primitive WRITES. A read-after-write
   * needs what they READ: an `Expect` whose `left` names a key another
   * primitive writes resolves by loop order, and order must not be load-bearing
   * in authored data. `Expect` has no `right` -- its second operand is a
   * literal `value` -- so only `left` is carried for it.
   */
  equals?: Array<{ key: string; left: string | null; right: string | null }>;
  expect?: Array<{ key: string; left: string | null }>;
  /** The item's point ceiling, for the attainable-score grid. */
  max?: number | null;
  /** Does this item derive its score from the credit slots? */
  deriveFromCredit?: boolean;
  /**
   * Does this item derive its score from the CRITERIA clauses?
   *
   * `deriveFromClauses="true"` in the OLX, python's `derive_from_criteria`.
   * Eight items carry it, and they are excluded wholesale from the sheet-side
   * orphan check: their rubric holds COMPOSITES while the sheet ENUMERATES the
   * sub-checks, so nearly every slot looks orphaned in that direction. That
   * asymmetry is the design, and a check that does not know it is useless on a
   * third of the corpus.
   */
  deriveFromCriteria?: boolean;
  /** The code an empty response produces, if declared. */
  blankCode?: string | null;
  /** Codes the rubric declares unreachable, with their reason elsewhere. */
  unreachableCodes?: string[];
  /** Each deduction's CODE and POINTS -- `deductions` above holds the prose. */
  charges?: Array<{ code: string; pts: number }>;
  /** `<Cover>` groups: which slots they span and what verdicts they add. */
  cover: Array<{ keys: string[]; verdicts: string[] }>;
  /** `<Map>` specs: the slot, the pick it reads, and what it can emit. */
  maps: Array<{ key: string; pick: string; emits: string[] }>;
  /**
   * The item's cadence, from `params="cadence=daily"`.
   *
   * It gates `SLOT_OPTIONS`: python returns the choices table only for a
   * handout that carries a cadence item, and `{}` elsewhere. The gate reads
   * THIS and not `conditions` -- those hold `cadence_daily`/`cadence_weekly`,
   * and testing them for the bare string `cadence` finds nothing.
   */
  cadence?: string | null;
  /** The grader-facing label, `label=` on the Item. Prompt prose. */
  label?: string;
  /** The item's question stem. */
  question: string;
  /** Deduction texts, which the prompt remainder treats as the item's OWN. */
  deductions: string[];
  /** Guidance bullets, in document order -- prompt prose the grader reads. */
  guidance: string[];
  /** Item-level rules, likewise. */
  rules: string[];
};

const PRIMITIVES = ['Equals', 'Forbid', 'Expect', 'Derived', 'Map'] as const;
/** Python's names for them, which is what `slot_basis` reports. */
const PRIMITIVE_KIND: Record<string, string> = {
  Equals: 'equals', Forbid: 'forbid', Expect: 'expect',
  Derived: 'derived', Map: 'maps',
};

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * NUMERIC CHARACTER REFERENCES, decoded.
 *
 * `processEntities` handles the named ones but leaves `&#x27;` and `&#39;` in
 * ATTRIBUTE values, so a rule's prose came back as
 * "the answer&#x27;s account" where python reads "the answer's account". Two
 * blocks keyed differently and ten texts differed -- invisible in the counts,
 * which were 328 on both sides.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)));
}

function attrs(node: unknown): Record<string, string> {
  const o = (node ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('@_')) out[k.slice(2)] = decodeEntities(String(v));
  }
  return out;
}

/** Parse the rubric .olx into the items the derivations need. */
export function readRubric(olxPath: string): RubricItem[] {
  const xml = readFileSync(olxPath, 'utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // The rubric's prose carries characters that must survive verbatim; the
    // derivations do not read prose, but mangling it would surprise a later one.
    processEntities: true,
    trimValues: false,
  });
  // The file is a fragment with a frontmatter comment; wrap so it parses as one
  // document regardless of how many roots it has.
  const doc = parser.parse(`<__root__>${stripFrontmatter(xml)}</__root__>`);
  const items: RubricItem[] = [];
  collectItems(doc, items);
  return items;
}

/** The frontmatter is an HTML comment; XML parsers keep it, and it is not data. */
function stripFrontmatter(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

function collectItems(node: unknown, out: RubricItem[]): void {
  if (node === null || typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  for (const [tag, value] of Object.entries(o)) {
    if (tag === 'Item') {
      for (const it of asArray(value)) out.push(materialiseItem(it));
      continue;
    }
    for (const child of asArray(value)) collectItems(child, out);
  }
}

function materialiseItem(node: unknown): RubricItem {
  const a = attrs(node);
  const o = (node ?? {}) as Record<string, unknown>;

  const credit: Credit[] = asArray(o.Credit).map((c) => {
    const ca = attrs(c);
    // `pts=""` IS NO POINTS, NOT ZERO POINTS, and `Number("")` is 0 -- so this
    // turned four unscored components into zero-point scorable ones. Harmless
    // in the attainable-score grid (adding 0 to a subset changes nothing) and
    // wrong for anything that asks whether a slot carries points at all.
    // Found by comparing the payload against python's, E63/step 8.
    const pts = (ca.pts === undefined || ca.pts === '') ? null : Number(ca.pts);
    const desc = ca.desc ?? (typeof c === 'string' ? c : textOf(c).trim() || undefined);
    return {
      attrs: desc === undefined ? { ...ca } : { ...ca, desc },
      what: ca.what,
      desc,
      rule: ca.rule,
      reported: ca.reported === 'true',
      pts,
      verdicts: ca.verdicts ? ca.verdicts.split('|') : undefined,
      // THE CODE KEYS ARE PART OF THE PAPER SPACE: python unions
      // `codes.keys()` into it, and a verdict that only appears as a code's
      // key is still a verdict the paper side can produce.
      codes: Object.fromEntries((ca.codes ?? '').split('|').filter(Boolean)
        .map((pair) => {
          const at = pair.indexOf('=');
          return at < 0 ? [pair.trim(), ''] : [pair.slice(0, at).trim(), pair.slice(at + 1).trim()];
        })),
      // `gates` and its threshold, as the family comparison reads them.
      gates: ca.gates === 'true' || ca.gate === 'true',
      at: ca.at === undefined ? null : Number(ca.at),
    };
  });

  const computed: Record<string, string> = {};
  // PER KIND AND IN ORDER, keys included even when absent: the collision check
  // asks whether two rules of one kind write one key, so a null must stay a
  // null rather than being filtered away into agreement.
  const kinds: Record<string, Array<string | null>> = {};
  for (const tag of PRIMITIVES) {
    const kind = PRIMITIVE_KIND[tag];
    const found = asArray(o[tag]);
    if (found.length) kinds[kind] = found.map(p => attrs(p).key ?? null);
    for (const p of found) {
      const key = attrs(p).key;
      if (key) computed[key] = `computed:${kind}`;
    }
  }
  const equals = asArray(o.Equals).map((e) => {
    const a2 = attrs(e);
    return { key: String(a2.key ?? ''), left: a2.left ?? null, right: a2.right ?? null };
  });
  const expect = asArray(o.Expect).map((e) => {
    const a2 = attrs(e);
    return { key: String(a2.key ?? ''), left: a2.left ?? null };
  });

  // `params="cadence=daily"` -- a `k=v;k=v` bag, of which only cadence is read.
  const params = String(attrs(node).params ?? '');
  const cadenceHit = /(?:^|[;|\s])cadence=([^;|\s]+)/.exec(params);
  const cadence = cadenceHit ? cadenceHit[1] : null;

  const counted = new Set<string>();
  // THE GROUP'S OWN KEY, KEPT APART. `counted` deliberately folds the key in
  // with the slots it covers, which is what the primitive-kind readers want.
  // `countableFamilies` needs python's narrower set -- the SLOTS ONLY -- and
  // could not recover it from the union, so the key is recorded separately
  // rather than guessed at by subtraction. E63/step 8, 2026-09-26.
  const countKeys = new Set<string>();
  for (const c of asArray(o.Counts)) {
    const ca = attrs(c);
    for (const s of (ca.slots ?? '').split(',').map(x => x.trim()).filter(Boolean)) {
      counted.add(s);
    }
    if (ca.key) counted.add(ca.key);
    if (ca.key) countKeys.add(ca.key);
  }
  // IN DOCUMENT ORDER, ungrouped. The finding ORDER is part of what a baseline
  // diff compares, and python walks the groups as the rubric wrote them.
  const counts = asArray(o.Counts).map((c) => {
    const ca = attrs(c);
    return {
      key: String(ca.key ?? ''),
      slots: (ca.slots ?? '').split(',').map(x => x.trim()).filter(Boolean),
    };
  });
  // `<Onlyif>` -- LOWERCASE `i`, which is how the rubric spells it. Matching
  // `OnlyIf` here would parse nothing and report a clean sheet.
  const onlyif = asArray(o.Onlyif).map((c) => {
    const ca = attrs(c);
    return { key: String(ca.key ?? ''), cond: String(ca.cond ?? '') };
  });

  // A COVER GROUP ADDS ITS VERDICTS to every slot it spans: python unions them
  // into the paper side, and leaving them out made 13 slots read as undeclared
  // asymmetries whose shape IS declared -- `('mismatch', ...)` and kin.
  const cover = asArray(o.Cover).map((c) => {
    const ca = attrs(c);
    return {
      keys: (ca.checks ?? '').split(',').map(s => s.trim()).filter(Boolean),
      verdicts: (ca.verdicts ?? '').split('|').map(s => s.trim()).filter(Boolean),
    };
  });

  // EVERY VERDICT A MAP CAN PRODUCE: its pairs' right-hand sides, plus its
  // fallback -- `enforcement._maps_emits`. `pairs="doing~met,own_state~met"`.
  const maps = asArray(o.Map).map((mNode) => {
    const ma = attrs(mNode);
    const emits = new Set<string>();
    for (const pair of (ma.pairs ?? '').split(',').filter(Boolean)) {
      const at = pair.indexOf('~');
      if (at >= 0) emits.add(pair.slice(at + 1).trim());
    }
    if (ma.fallback) emits.add(ma.fallback.trim());
    return { key: ma.key ?? '', pick: ma.pick ?? '', emits: [...emits].sort() };
  });

  // GUIDANCE AND RULES, as `leakage.authored` reads them: every bullet is its
  // own block, because a review verdict keys on the sha of one block's prose
  // and a single merged string would lapse on any edit anywhere inside it.
  const question = textOf(asArray(o.Question)[0] ?? '').trim();
  const deductions = asArray(o.Deduction)
    .map(d => (attrs(d).text ?? textOf(d)).trim()).filter(Boolean);
  const guidance = asArray(o.Guidance).map(g => textOf(g).trim()).filter(Boolean);
  const rules = asArray(o.Rule).map(r => textOf(r).trim()).filter(Boolean);

  // THE CODE PATH, added for `codes_reachable` (goal K). The rubric carries all
  // of it and this parser simply was not surfacing it: `deductions` above keeps
  // only each Deduction's PROSE, which is what the leak checks read, so a rule
  // asking "can any verdict emit this code" had nothing to ask.
  const charges = asArray(o.Deduction).map(d => {
    const da = attrs(d);
    return { code: da.code ?? '', pts: Number(da.pts ?? 0) };
  }).filter(d => d.code);

  return {
    id: a.scores ?? a.id ?? '',
    asks: a.asks,
    family: a.family,
    max: a.max === undefined ? null : Number(a.max),
    deriveFromCredit: a.deriveFromCredit === 'true',
    deriveFromCriteria: a.deriveFromClauses === 'true',
    blankCode: a.blankCode ?? null,
    // `unreachableCodes=""` IS A DECLARATION OF NONE, not a missing attribute,
    // and one item writes it that way. Splitting an empty string would yield
    // `['']` and report a phantom code, so the empty case is filtered.
    unreachableCodes: (a.unreachableCodes ?? '').split(/[,|]/)
      .map(s => s.trim()).filter(Boolean),
    charges,
    credit,
    computed,
    kinds,
    counted: [...counted],
    countKeys: [...countKeys],
    counts,
    onlyif,
    equals,
    expect,
    cover,
    maps,
    cadence,
    label: attrs(node).label ?? undefined,
    question,
    deductions,
    guidance,
    rules,
  };
}


/** Every text node under a parsed element, in document order. */
function textOf(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object') {
    let out = '';
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith('@_')) continue;        // attributes are not text
      out += textOf(v);
    }
    return out;
  }
  return '';
}

/**
 * `olx_prompts.SLOT_NOTES`: the shared note store, `{slot key: text}`.
 *
 * NOT A TABLE TO MOVE. It looked like another python-only declaration, and it
 * is not: `rubric_component.as_view_notes()` DERIVES it from
 * `<Frame name="note:KEY">` elements in the rubric itself, so it was already
 * readable here.
 *
 * NAMED, NOT COPIED PER SLOT: 28 notes cover 102 slot sites on this corpus --
 * `confident` alone is reached by 23 -- so resolving them into the slots would
 * write 102 copies of 28 texts, and every copy is a place the next edit can
 * miss. Item-scoped keys keep their shape: `Q6:state_a1` stays exactly that.
 */
/**
 * The SHEET, per item: `{item id: [slot key, ...]}` from its `<Slot>` elements.
 *
 * `rubric_component.as_view_slots`, which is what the modules carried as
 * `SLOT_SPEC` and what `slots=` on an `<LLMAction>` is generated FROM -- the
 * element is the source and the attribute the projection.
 *
 * DESCENDANTS, NOT CHILDREN, matching python's `el.iter("Slot")`: a slot nested
 * inside a group still belongs to its item, and reading only direct children
 * would drop it and report the name as unknown.
 *
 * ORDER IS DOCUMENT ORDER and is never sorted -- `slots=` is emitted in it and
 * the checklist is rendered in it, so the order is content.
 */
/**
 * `{set name: [option, ...]}` from `<Choices name= options=/>`.
 *
 * THE MENUS A `pick()` SLOT OFFERS, where the set's membership is a rubric fact
 * rather than an element's: a set is named by several slots and belongs to none
 * of them. This is what the deleted `rubric_h2` carried as `SLOT_OPTIONS`.
 */
export function rubricChoices(olxPath: string): Record<string, string[]> {
  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '@_',
    processEntities: true, trimValues: false,
  });
  const doc = parser.parse(
    `<__root__>${stripFrontmatter(readFileSync(olxPath, 'utf8'))}</__root__>`);
  const out: Record<string, string[]> = {};
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith('@_')) continue;
      for (const child of asArray(v)) {
        if (k === 'Choices') {
          const a2 = attrs(child);
          if (a2.name) {
            out[a2.name] = (a2.options ?? '').split(',')
              .map(s => s.trim()).filter(Boolean);
          }
        }
        walk(child);
      }
    }
  };
  walk(doc);
  return out;
}

export function sheetSlots(olxPath: string): Record<string, Array<{ key: string; seg: string | null }>> {
  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '@_',
    processEntities: true, trimValues: false,
  });
  const doc = parser.parse(
    `<__root__>${stripFrontmatter(readFileSync(olxPath, 'utf8'))}</__root__>`);
  const out: Record<string, Array<{ key: string; seg: string | null }>> = {};
  // THE `seg` COMES WITH THE KEY. `resolveOptions` needs it to say what a slot
  // OFFERS, and a second walk to fetch it would be a second parser of the same
  // element -- the duplication this file keeps paying for elsewhere.
  const slotsUnder = (node: unknown, acc: Array<{ key: string; seg: string | null }>): void => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith('@_')) continue;
      for (const child of asArray(v)) {
        if (k === 'Slot') {
          const a2 = attrs(child);
          if (a2.key) acc.push({ key: a2.key, seg: a2.seg ?? null });
        }
        slotsUnder(child, acc);
      }
    }
  };
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith('@_')) continue;
      for (const child of asArray(v)) {
        if (k === 'Item') {
          const iid = attrs(child).scores;
          const acc: Array<{ key: string; seg: string | null }> = [];
          slotsUnder(child, acc);
          // BOTH, as python's `if iid and clauses` requires: an item with no
          // slots is absent from the table rather than present and empty.
          if (iid && acc.length) out[iid] = acc;
        }
        walk(child);
      }
    }
  };
  walk(doc);
  return out;
}

/**
 * Direct-child `<Slot key=>` per `<Item scores=>`, items with NONE kept.
 *
 * NOT `sheetSlots`, and both differences are deliberate. python's
 * `rubric_component.load` builds an item's slots with `item.findall("Slot")` --
 * DIRECT CHILDREN -- while `sheetSlots` recurses through `slotsUnder`; and
 * `load` keeps every `<Item scores=>` while `sheetSlots` drops the slotless
 * ones (`if (iid && acc.length)`).
 *
 * MEASURED ON THIS CORPUS, 2026-09-27: 0 items carry a nested `<Slot>`, and 3
 * carry none at all (T1, T2, 1b). So the recursion difference is INERT today
 * and the drop is unreachable from the caller that exists -- which is exactly
 * why this is a separate reader rather than a reuse. A reader that silently
 * omits an entry makes its caller report `entryExists: false`, and that is a
 * FALSE finding, not a missing one.
 *
 * Verified against python: 26 items both sides, no item on one side only, 0
 * differing key lists.
 */
export function stagedRubricSlots(olxPath: string): Record<string, string[]> {
  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '@_',
    processEntities: true, trimValues: false,
  });
  const doc = parser.parse(
    `<__root__>${stripFrontmatter(readFileSync(olxPath, 'utf8'))}</__root__>`);
  const out: Record<string, string[]> = {};
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith('@_')) continue;
      for (const child of asArray(v)) {
        if (k === 'Item') {
          const iid = attrs(child).scores;
          if (iid) {
            const keys: string[] = [];
            for (const sl of asArray((child as Record<string, unknown>)?.Slot)) {
              const a = attrs(sl);
              if (a.key) keys.push(a.key);
            }
            out[iid] = keys;            // KEPT even when empty
          }
        }
        walk(child);
      }
    }
  };
  walk(doc);
  return out;
}


export function slotNotes(olxPath: string): Record<string, string> {
  const xml = readFileSync(olxPath, 'utf8');
  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '@_',
    processEntities: true, trimValues: false,
  });
  const doc = parser.parse(`<__root__>${stripFrontmatter(xml)}</__root__>`);
  const out: Record<string, string> = {};
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    for (const [tag, value] of Object.entries(node as Record<string, unknown>)) {
      if (tag === 'Frame') {
        for (const f of asArray(value)) {
          const name = attrs(f).name ?? '';
          if (!name.startsWith('note:')) continue;
          // THE TEXT IS IN A `<Segment>` CHILD, not the Frame's own `#text`.
          // Reading `#text` gave 27 keys and 27 EMPTY strings -- the right
          // shape with none of the content, which the key comparison alone
          // called a match.
          out[name.slice('note:'.length)] = textOf(f).trim();
        }
        continue;
      }
      for (const child of asArray(value)) walk(child);
    }
  };
  walk(doc);
  return out;
}

/**
 * `olx_prompts.ACTION`: item id -> the element carrying its slot sheet.
 *
 * FROM THE RUBRIC, as python derives it -- `{it.id: it.asks for it in items if
 * it.asks}`. It was once inferred from the OLX id PREFIX (`bmod_h1...` -> 1),
 * which silently classified any course whose ids are not `bmod_*` as handout 3:
 * a wrong answer rather than an error. The rubric declares it, so it is read.
 */
export function actionMap(items: RubricItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of items) if (it.asks) out[it.id] = it.asks;
  return out;
}

/**
 * The opening tag of whichever element carries `element`'s slot sheet.
 *
 * THE PYTHON REGEX, CHARACTER FOR CHARACTER (`olx_prompts._SHEET_RE`). Python
 * reads the shipped .olx with a regex rather than an XML parse here, so doing
 * the same is faithful; a structural parse would disagree the moment the file
 * held something the parser normalised differently.
 */
export function sheetTag(olx: string, element: string): string | null {
  const re = new RegExp(
    `<(?:LLMAction|DerivedChecks)\\b[^>]*?\\bid="${element.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*?/?>`,
    's');
  const m = olx.match(re);
  return m ? m[0] : null;
}

/**
 * The BODY of an `<LLMAction>` -- the prompt as it ships.
 *
 * `olx_prompts._ACTION_RE`, character for character.
 */
export function actionBody(olx: string, element: string): string | null {
  const esc = element.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(<LLMAction\\b[^>]*?\\bid="${esc}"[^>]*>)([\\s\\S]*?)(</LLMAction>)`);
  const m = olx.match(re);
  return m ? m[2] : null;
}

/** One attribute off a tag, as `re.search(r'\bname="([^"]*)"', tag)` reads it. */
export function tagAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/**
 * The shipped `<Ref .../>` spelling turned back into the builder's placeholder.
 *
 * `build_web_prompt` emits `REF:id:target\0` and `corpus_resolve.to_olx`
 * renders it as `<Ref id="..." target="..." />` on the way into the .olx. For
 * most rules the difference is invisible -- measured equivalent for
 * `no_case_names_in_prompts` and `every_designed_entry_ships`. For the prompt
 * REMAINDER it is not: the rendered form is longer, so it moves passage
 * boundaries and the labels cut from them, and the shipped text produced 979
 * blocks where python produces 965.
 *
 * THE NULS ARE PART OF IT, BOTH OF THEM. The placeholder is `\0REF:id:target\0`
 * -- wrapped, not merely terminated. Emitting only the trailing one left every
 * affected label one character short and fifteen blocks keyed differently:
 * `[box begins]  REF:` against `[box begins] REF:`. The counts matched at 965
 * either way, which is why the keys had to be compared and not just counted.
 */
export function toRefPlaceholders(olxBody: string): string {
  return olxBody.replace(
    /<Ref\s+id="([^"]*)"\s+target="([^"]*)"\s*\/>/g,
    (_m, id, target) => `\u0000REF:${id}:${target}\u0000`);
}

/** `leakage._norm`: collapse whitespace, trim, lowercase. */
export function norm(s: string): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * `leakage._prompt_remainder`, transcribed.
 *
 * The shipped prompt MINUS what the granular blocks already cover, cut into
 * contiguous PASSAGES -- one entry per passage, not one per prompt.
 *
 * WHY PASSAGES. A single ~13KB remainder re-hashes on any edit anywhere inside
 * it, so its review verdict lapses immediately and a finding points at a third
 * of a prompt. Neither is reviewable.
 *
 * AND A PASSAGE TOO SHORT IS MERGED, NOT DROPPED. Dropping it silently
 * un-scanned prose -- Q1's "- The UTB must be one of the four from the closed
 * list." is a bullet standing alone between boundaries, just under the
 * threshold. The threshold exists so tiny fragments do not each become a block,
 * not so text escapes the corpus.
 */
export function promptRemainder(
  prompt: string, coveredText: string, own: string[],
): Array<[string, string]> {
  const covered = norm(coveredText);
  const ownNorm = own.map(norm).filter(Boolean);
  // WRITTEN AS PYTHON WROTE IT. The last alternative matches a SHOUTED heading
  // of twelve characters or more; narrowing it changes where passages begin.
  const BOUNDARY = /^\s*(\d+\.\s|#{1,4}\s|\([a-z]\)|[A-Z][A-Z ,'`-]{11,})/;
  const passages: string[][] = [];
  for (const raw of prompt.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const s = norm(line);
    if (!s) { passages.push([]); continue; }      // a blank line ends a passage
    if (s.length < 25 || covered.includes(s)
        || ownNorm.some(o => s.includes(o) || o.includes(s))) continue;
    if (!passages.length || BOUNDARY.test(line)) passages.push([]);
    passages[passages.length - 1].push(line.trim());
  }
  const out: Array<[string, string]> = [];
  for (const lines of passages) {
    if (!lines.length) continue;
    const text = lines.join('\n');
    if (out.length && norm(text).length < 60) {
      out[out.length - 1][1] += '\n' + text;
      continue;
    }
    out.push([lines[0].replace(/\s+/g, ' ').trim().slice(0, 46), text]);
  }
  return out;
}

/**
 * `enforcement.slot_basis`, transcribed.
 *
 * A pure function over one item: which channel judges each of its slots. The
 * order of the tests is load-bearing and is python's — `maps` is included among
 * the primitives because leaving it out once reported Q4b's `behavior_*` as
 * prose-judged on the very day they stopped being judged at all.
 */
export function slotBasis(item: RubricItem): Record<string, string> {
  const counted = new Set(item.counted ?? []);
  const out: Record<string, string> = {};
  for (const c of item.credit ?? []) {
    const key = c.what;
    if (key in (item.computed ?? {})) out[key] = item.computed[key];
    else if (counted.has(key)) out[key] = 'counted';
    else if (c.rule) out[key] = 'prose+rule';
    else out[key] = 'prose';
  }
  return out;
}
