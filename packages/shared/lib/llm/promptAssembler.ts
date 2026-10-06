import type {
  AssembleOptions, AssemblerSlot, ComputedRules, CreditEntry,
} from './promptAssembler.types'

/**
 * The prose this assembler needs, supplied by the CALLER.
 *
 * NOT DEFAULTED, and that is the point. Every heading and paragraph a grader
 * reads is course content; baking an English default into the engine would put
 * content in lo-blocks (C2) and make the default the real source the moment
 * anyone forgot to override it. The KEYS are engine concepts; the WORDS are not.
 *
 * A value may carry `{param}` placeholders, filled from the same substitution
 * `renderFrame` uses.
 */
export type Fragments = Record<string, string>

/** Fail loudly: a missing fragment renders a silently truncated prompt. */
export function frag(f: Fragments, key: string, params: Record<string, string> = {}): string {
  const v = f[key]
  if (v == null) {
    throw new Error('prompt fragment ' + JSON.stringify(key) + ' was not supplied; '
      + 'the assembler holds no default prose')
  }
  return v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m))
}


/**
 * Assemble the prompt body for one item.
 *
 * VERTICAL SLICE: the sections before the checklist. Enough to prove the
 * options object is sufficient and that the byte oracle can be met at all,
 * which is worth knowing before the remaining ~900 lines are ported.
 *
 * Content-neutral (C2): every word rendered arrives in `options`. The system
 * preamble in particular names a course and a subject, so it is supplied by the
 * caller rather than held here.
 */
export function assembleBodyPrefix(o: {
  item: AssembleOptions['item'] & { guidance: string[] }
  blurb: string
  webSystem: string
  fragments: Fragments
  /** Shared frame segments, when the item builds its body from clauses. */
  frame?: FrameSegment[]
}): string {
  const p: string[] = [o.webSystem.replace('{blurb}', o.blurb), '']
  // `%g`: 6 not 6.0, and 2.5 stays 2.5.
  const g = (n: number) => String(Number(n))
  p.push(frag(o.fragments, 'itemHeading',
               { id: o.item.id, max: g(o.item.max) }) + '\n')
  p.push(frag(o.fragments, 'questionHeading') + '\n' + o.item.question + '\n')

  // A TERM DEFINED AT ITS FIRST USE, before whichever body follows. Both
  // branches place it here: the definition belongs immediately before the text
  // that uses the word, not forty lines later in the guidance.
  if (o.item.termDefinition) p.push(o.item.termDefinition)

  if (o.item.deriveFromClauses) {
    // The judging frame, assembled from shared segments the item selects.
    p.push(renderFrame(o.frame ?? [],
                       new Set(o.item.conditions ?? []),
                       o.item.frameParams ?? {}))
  } else {
    const omitCredit = new Set(o.item.omitCredit ?? [])
    p.push(frag(o.fragments, 'creditHeading'))
    for (const c of o.item.credit) {
      if (omitCredit.has(c.what)) continue
      const worth = c.gates ? ' **GATE**' : c.pts == null ? '' : ` (${g(c.pts)} pt)`
      p.push(`- \`${c.what}\`${worth}: ${c.desc}`)
    }
    p.push('')
  }

  const omitDed = new Set(o.item.omitDeduction ?? [])
  p.push(frag(o.fragments, 'deductionHeading'))
  for (const d of o.item.deductions) {
    if (omitDed.has(d.code)) continue
    const rep = d.repeatable ? ' [repeatable]' : ''
    p.push(`- \`${d.code}\` (-${g(d.pts)})${rep}: ${d.text}`)
  }
  p.push('')

  const drop = new Set(o.item.omitGuidance ?? [])
  const kept = o.item.guidance.filter((_, i) => !drop.has(i))
  if (kept.length) {
    p.push(frag(o.fragments, 'guidanceHeading'))
    for (const line of kept) p.push(`- ${line}`)
    p.push('')
  }
  return p.join('\n')
}


/**
 * The sheet the model must fill.
 *
 * Checks the grader COMPUTES are listed separately and explicitly NOT asked
 * for: they are absent from the response schema, so requesting them would be
 * asking for something the model cannot supply.
 *
 * Every "DO NOT ANSWER" paragraph is prose about arithmetic, and none of it
 * names a subject -- the rule shapes are engine concepts (counts, equals,
 * expect, forbid, maps, derived), the slot names inside them are data.
 */
/**
 * A counting slot's ceiling, under EITHER spelling.
 *
 * `slotSheet.parseSlots` -- this engine's own parser -- emits `countMax`, and
 * this file read `count_max`, the shape the python generator's dump happens to
 * use. The two never met: the assembler had only ever been driven from that
 * dump, so the engine's own parser could not drive its own assembler. Feeding it
 * `parseSlots` output dropped the "a NUMBER from 0 to N" head from every
 * counting slot on four items, and the prompt still read as prose.
 *
 * Both are accepted while both callers exist.
 */
function countMaxOf(s: any): number | null | undefined {
  return s.countMax ?? s.count_max
}


export function assembleChecklist(o: {
  slots: AssemblerSlot[]
  rules: ComputedRules
  credit: CreditEntry[]
  /**
   * The note rendered after each slot head, ALREADY RESOLVED, keyed by slot.
   *
   * Resolution is the caller's job because it needs the rubric's own vocabulary.
   * The generator's precedence is `rule` -> `SLOT_NOTES[item:slot]` ->
   * `SLOT_NOTES[slot]` -> credit `desc`, and the first of those is a template:
   * `{fail}` becomes THIS slot's failing verdict and `{fail:other}` a sibling's,
   * which only something holding the rubric can fill. A port that implements two
   * of the four silently drops the note on every slot the other two cover --
   * measured here: `confident` renders bare, and its global note is one of 4
   * unqualified entries that an item-scoped lookup cannot see.
   */
  notes?: Record<string, string>
  fragments: Fragments
}): string {
  const { counts, equals, derived, choices, expect, forbid, maps } = o.rules
  const computed = new Map(equals.map(r => [r.key, r]))
  const fromPage = new Map(derived.map(r => [r.key, r]))
  const counted = new Set(counts.flatMap(c => c.slots))
  const expected = new Set(expect.map(r => r.key))
  const forbidden = new Map(forbid.map(r => [r.key, r]))
  const mapped = new Map(maps.map(r => [r.key, r]))
  const desc = new Map(o.credit.map(c => [c.what, c.desc]))
  const gateOf = (key: string) =>
    o.slots.find(s => s.key === key)?.gates ? ' **GATE**' : ''
  const tick = (xs: string[], sep: string) => xs.map(x => `\`${x}\``).join(sep)

  const lines: string[] = [
    ...frag(o.fragments, 'checklistPreamble').split('\n'),
    '',
  ]
  for (const s of o.slots) {
    if (computed.has(s.key) || fromPage.has(s.key) || counted.has(s.key)
        || expected.has(s.key) || forbidden.has(s.key) || mapped.has(s.key)) continue
    const note = o.notes?.[s.key] ?? desc.get(s.key)
    const gate = s.gates ? ' **GATE**' : ''
    let head: string
    if (s.picks != null) {
      head = `- \`${s.key}\`${gate} — one of ${tick(choices[s.picks] ?? [], '/')} `
           + `in \`refers_to\` (WHICH it is, not whether it is right)`
    } else if (countMaxOf(s) != null) {
      head = `- \`${s.key}\`${gate} — a NUMBER from 0 to ${countMaxOf(s)} `
           + `(how many, not a judgement)`
    } else {
      head = `- \`${s.key}\`${gate} — ${tick(s.options, '/')}`
    }
    lines.push(note ? `${head}: ${note}` : head)
  }
  for (const r of maps) {
    const key = r.key
    lines.push('', frag(o.fragments, 'mapsNote', {
      key: '`' + key + '`' + gateOf(key), pick: '`' + r.pick + '`',
      pairs: r.pairs.map(c => '`' + c.value + '` makes it `' + c.verdict + '`').join(', '),
      tail: r.fallback ? ', and anything else makes it `' + r.fallback + '`' : '',
    }))
  }
  for (const r of forbid) {
    const key = r.key
    lines.push('', frag(o.fragments, 'forbidNote', {
      key: '`' + key + '`' + gateOf(key),
      pairs: r.conds.map(c => '`' + c.slot + '` is `' + c.value + '`').join(', '),
    }))
  }
  for (const r of equals) {
    const key = r.key
    lines.push('', frag(o.fragments, 'equalsNote', {
      key: '`' + key + '`' + gateOf(key), left: '`' + r.left + '`', right: '`' + r.right + '`',
      lenient: r.lenient?.length
        ? frag(o.fragments, 'equalsLenient',
               { options: r.lenient.map(x => '`' + x + '`').join(' or ') })
        : '',
    }))
  }
  for (const r of expect) {
    lines.push('', frag(o.fragments, 'expectNote', {
      key: '`' + r.key + '`' + gateOf(r.key), left: '`' + r.left + '`',
      value: '`' + r.value + '`',
      lenient: r.lenient?.length
        ? frag(o.fragments, 'expectLenient',
               { options: r.lenient.map(x => '`' + x + '`').join('` or `') })
        : '',
    }))
  }
  for (const cr of counts) {
    lines.push('', frag(o.fragments, 'countsNote',
      { members: tick(cr.slots, ', '), key: '`' + cr.key + '`' }))
  }
  for (const r of derived) {
    const key = r.key
    const kind = r.kind === 'present' ? 'derivedPresent'
               : r.kind === 'contains' ? 'derivedContains' : 'derivedPlots'
    lines.push('', frag(o.fragments, 'derivedNote', {
      key: '`' + key + '`' + gateOf(key),
      body: frag(o.fragments, kind,
                 { words: (r.words ?? []).map(w => '"' + w + '"').join(' or ') }),
    }))
  }
  if (o.slots.some(s => s.gates)) {
    lines.push('', frag(o.fragments, 'gateNote'))
  }
  lines.push('')
  return lines.join('\n')
}


/** A reference to an input field, already resolved to its ref id by the caller. */
export interface FieldRef { label: string; refId: string; target: string }

/**
 * The sentinel `build_web_prompt` emits for a field reference.
 *
 * NOT markup. The generator writes a NUL-delimited placeholder and a later
 * render step turns it into `<Ref id=... target=... />`, which keeps the
 * assembler out of the business of XML entirely. Reproducing the SENTINEL is
 * what byte-exactness means at this layer; emitting the XML would be a
 * different string and would move the boundary render() owns.
 */
const NUL = '\u0000'
const refSentinel = (r: FieldRef) => NUL + 'REF:' + r.refId + ':' + r.target + NUL

/**
 * Cross-references to other items' inputs, then this item's own boxes.
 *
 * The three item-keyed tables behind this -- RESPONSE (23 entries), REF_IDS (23
 * actions) and EVIDENCE (1) -- are content living in the generator, like
 * SLOT_NOTES before them. The caller resolves all of it; the engine lays it out.
 */
export function assembleContextAndResponse(o: {
  itemId: string
  context: Array<{ heading: string; lines: FieldRef[] }>
  evidence?: { note: string; refs: FieldRef[] }
  response: FieldRef[]
  fragments: Fragments
  /** Declared prose blocks, rendered before the cross-references. */
  sections?: Array<{ heading: string; body?: string; field?: string }>
}): string {
  const p: string[] = []
  // DECLARED SECTIONS COME FIRST, before the cross-references. They sit after
  // the checklist and before the context block, and the targets they emit are
  // then SUPPRESSED from the context that follows -- the generator keeps a
  // `seen` set for exactly that, so a field is quoted once, not twice.
  for (const sec of o.sections ?? []) {
    p.push(frag(o.fragments, 'sectionHeading', { heading: sec.heading })
           + (sec.body ? '\n' + sec.body : ''))
    if (sec.field) p.push(sec.field + '\n')
  }
  if (o.context.length) {
    p.push(frag(o.fragments, 'contextHeading'))
    p.push(frag(o.fragments, 'contextPreamble'))
    for (const blk of o.context) {
      p.push('\n### ' + blk.heading)
      for (const r of blk.lines) {
        p.push((r.label ? r.label + ': ' : '') + refSentinel(r))
      }
    }
    p.push('')
  }
  if (o.evidence) {
    p.push(o.evidence.note)
    for (const r of o.evidence.refs) p.push(r.label + ': ' + refSentinel(r))
    p.push('')
  }
  p.push(frag(o.fragments, 'responseHeading', { itemId: o.itemId }))
  if (o.response.some(r => r.label)) {
    p.push(frag(o.fragments, 'responsePreamble'))
  }
  for (const r of o.response) {
    if (r.label) p.push(frag(o.fragments, 'askedFor', { label: r.label }))
    p.push(frag(o.fragments, 'boxOpen') + refSentinel(r) + frag(o.fragments, 'boxClose'))
  }
  p.push(frag(o.fragments, 'endOfResponse'))
  return p.join('\n')
}


/**
 * One piece of a shared prose frame.
 *
 * THE UNIT IS A SEGMENT, NOT A CLAUSE. In the corpus this was measured on, one
 * numbered clause varies by a sentence spliced INSIDE it -- suppressed on the
 * single item where that reading gates the score -- so a clause-level mechanism
 * would have to store two copies of the clause. Segments concatenate, and a
 * whole clause is just a segment that happens to be one.
 */
export interface FrameSegment {
  text: string
  /**
   * Render this segment only when the item declares this condition.
   * `!name` renders it only when the item does NOT.
   */
  when?: string
}

/**
 * Render a shared frame for one item.
 *
 * The engine decides NOTHING about meaning: `when` is matched against condition
 * names the item declares, and `{param}` against parameters it supplies. What
 * any of those names MEAN is never known here, which is what C2 requires.
 */
export function renderFrame(
  segments: FrameSegment[],
  conditions: Set<string>,
  params: Record<string, string> = {},
): string {
  const out: string[] = []
  for (const seg of segments) {
    if (seg.when) {
      const negated = seg.when.startsWith('!')
      const name = negated ? seg.when.slice(1) : seg.when
      if (conditions.has(name) === negated) continue
    }
    out.push(seg.text.replace(/\{(\w+)\}/g, (m, k) =>
      k in params ? params[k] : m))
  }
  return out.join('')
}


/**
 * Every item's FULL RUNTIME PROMPT, by id -- what the grader is actually sent.
 *
 * The three `assemble*` functions above build the parts; this is the one
 * composition of them, and it is python's `build_web_prompt` exactly: measured
 * 2026-09-26, all 23 prompts byte-identical.
 *
 * WHY IT IS HERE AND NOT IN A SCRIPT. It was spelled out in two scripts
 * (`assemble-prompts`, `verify-assembled-prompts`), which is fine while the
 * only readers are build steps. The enforcement checks that ask questions ABOUT
 * the shipped prompt need the same string, and a third copy of a nine-line
 * composition is how the joins drift -- the `parts.join('\n')` and the trailing
 * newline are both load-bearing, and neither is obvious.
 *
 * `inputs` is the `assembler-inputs.json` document, fragments and frame
 * included; it is consumed non-destructively, unlike the scripts' `delete`.
 */
export function webPrompts(inputs: Record<string, any>): Record<string, string> {
  const { _fragments: fragments, _frame: frame } = inputs;
  const out: Record<string, string> = {};
  for (const [id, d] of Object.entries<any>(inputs)) {
    if (id.startsWith('_')) continue;
    const parts: string[] = [assembleBodyPrefix({
      item: d.item, blurb: d.blurb, webSystem: d.webSystem, fragments, frame })];
    if (d.item.itemNotes) parts.push(d.item.itemNotes);
    parts.push(assembleChecklist({
      slots: d.slots, credit: d.item.credit, notes: d.notes,
      fragments, rules: d.rules }));
    parts.push(assembleContextAndResponse({
      itemId: id, context: d.context, evidence: d.evidence ?? undefined,
      response: d.response, fragments, sections: d.sections }));
    out[id] = parts.join('\n').replace(/\s+$/, '') + '\n';
  }
  return out;
}
