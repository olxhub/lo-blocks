// Build what `promptAssembler` needs, WITHOUT PYTHON.
//
// `olx_prompts.py --assembler-inputs` has supplied this until now, which left the
// build depending on the producer it is meant to replace. Item C's rule is that no
// part of OLX prompt generation may depend on python; this is the half that makes
// that true.
//
// WHERE EACH PIECE COMES FROM, and none of it is new data:
//   the rubric      items, fragments, the shared frame, judging notes, slot
//                   sheets, choice menus  -- `bmod_rubric.olx`, staged
//   course.json     the generator fields: which handout, which refs an item
//                   quotes, its own notes, its term definition, its omissions
//   the handout     the sheet attributes, parsed with the engine's own parsers
//                   rather than re-implemented here
//
// THE ORACLE IS THE PYTHON DUMP, field by field, until the two agree. That is why
// this emits the same shape rather than a nicer one: a shape difference would
// hide a content difference.
import { readFileSync, readdirSync } from 'node:fs'
import {
  parseSlots, parseCounts, parseMaps, parseForbid, parseEquals, parseExpect,
  parseDerived, parseChoices,
} from '../lib/llm/slotSheet'

const RUBRIC = process.env.RUBRIC_OLX!
const COURSE = process.env.COURSE_JSON!
const HANDOUTS = process.env.HANDOUT_DIR!

const xml = readFileSync(RUBRIC, 'utf8')
const course = JSON.parse(readFileSync(COURSE, 'utf8'))

/** Comments are stripped before anything is read, as every other reader does. */
const bare = xml.replace(/<!--[\s\S]*?-->/g, '')

const unesc = (s: string) => s
  .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&')

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  // UNESCAPED LIKE ELEMENT TEXT. A judging `rule=` lives in an attribute, and
  // leaving its entities encoded put `&#x27;` and `&quot;` into eight items'
  // checklists -- visible only by diffing against the generator, because the
  // prompt still read as prose.
  for (const m of tag.matchAll(/([A-Za-z_][\w.:-]*)="([^"]*)"/g)) out[m[1]] = unesc(m[2])
  return out
}
/** `<Frame name="X"><Segment ...>text</Segment>...</Frame>` -> segments. */
function frames(): Map<string, Array<{ text: string; when?: string }>> {
  const out = new Map<string, Array<{ text: string; when?: string }>>()
  for (const m of bare.matchAll(/<Frame\s+name="([^"]+)"\s*>([\s\S]*?)<\/Frame>/g)) {
    const segs: Array<{ text: string; when?: string }> = []
    for (const s of m[2].matchAll(/<Segment([^>]*)>([\s\S]*?)<\/Segment>/g)) {
      const a = attrs(s[1])
      segs.push({ text: unesc(s[2]), when: a.ifDeclared })
    }
    out.set(m[1], segs)
  }
  return out
}

const FRAMES = frames()
const fragments: Record<string, string> = {}
for (const [name, segs] of FRAMES) {
  if (name.startsWith('fragment:')) {
    fragments[name.slice('fragment:'.length)] = segs.map(s => s.text).join('')
  }
}
const frame = (FRAMES.get('oc_criteria') ?? []).map(s => ({ text: s.text, when: s.when ?? null }))
const notesStore: Record<string, Array<{ text: string; when?: string }>> = {}
for (const [name, segs] of FRAMES) {
  if (name.startsWith('note:')) notesStore[name.slice('note:'.length)] = segs
}

const detag = (v: any): any => {
  if (Array.isArray(v)) return v.map(detag)
  if (v && typeof v === 'object') {
    if ('__tuple__' in v) return detag(v.__tuple__)
    const o: any = {}
    for (const k of Object.keys(v)) o[k] = detag(v[k])
    return o
  }
  return v
}

// AN EMPTY ATTRIBUTE IS NOT ZERO. `pts=""` on a reported-only component means it
// carries no points, and `Number('')` is 0 -- which would have rendered "(0 pt)"
// beside four credit components that print nothing today.
const num = (v: string | undefined) =>
  v === undefined || v.trim() === '' ? undefined : Number(v)

/** One `<Item>` element's block of source, by the id it scores. */
function itemBlocks(): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of bare.matchAll(/<Item\s([^>]*)>([\s\S]*?)<\/Item>/g)) {
    const a = attrs(m[1])
    if (a.scores) out.set(a.scores, m[0])
  }
  return out
}
const BLOCKS = itemBlocks()

function children(block: string, tag: string): Array<{ a: Record<string, string>; text: string }> {
  const out: Array<{ a: Record<string, string>; text: string }> = []
  // THE ATTRIBUTE PART IS OPTIONAL. `<Question>` and `<Guidance>` carry none, so
  // a pattern demanding a space after the tag name matches neither -- which read
  // as an item with no question and no guidance rather than as a broken pattern.
  const selfClose = new RegExp(`<${tag}(\\s[^>]*?)?/>`, 'g')
  const paired = new RegExp(`<${tag}(\\s[^>]*?)?>([\\s\\S]*?)</${tag}>`, 'g')
  for (const m of block.matchAll(paired)) out.push({ a: attrs(m[1] ?? ''), text: unesc(m[2]) })
  for (const m of block.matchAll(selfClose)) out.push({ a: attrs(m[1] ?? ''), text: '' })
  return out
}

const TRUE = new Set(['true', 'True', '1', 'yes'])
const NUL = String.fromCharCode(0)

/** The rubric item, in the shape `promptAssembler` takes. */
function rubricItem(id: string) {
  const block = BLOCKS.get(id)!
  const a = attrs(/<Item\s([^>]*)>/.exec(block)![1])
  const conds = (a.conditions ?? '').split('|').filter(Boolean)
  const params: Record<string, string> = {}
  for (const kv of (a.params ?? '').split('|').filter(Boolean)) {
    const i = kv.indexOf('=')
    if (i > 0) params[kv.slice(0, i)] = kv.slice(i + 1)
  }
  const q = children(block, 'Question')[0]
  const credit = children(block, 'Credit').map(c => {
    const o: any = { what: c.a.what }
    if (c.a.pts !== undefined) o.pts = num(c.a.pts)
    if (c.a.rule !== undefined) o.rule = c.a.rule
    if (c.a.reported !== undefined) o.reported = TRUE.has(c.a.reported)
    if (c.a.verdicts !== undefined) o.verdicts = c.a.verdicts.split('|')
    if (c.a.free !== undefined) o.free = c.a.free.split('|')
    if (c.a.gates !== undefined) o.gates = TRUE.has(c.a.gates)
    if (c.text.trim()) o.desc = c.text
    return o
  })
  const deductions = children(block, 'Deduction').map(x => {
    const o: any = { code: x.a.code, pts: num(x.a.pts), text: x.text }
    if (x.a.repeatable !== undefined) o.repeatable = TRUE.has(x.a.repeatable)
    return o
  })
  return {
    id, block, conds, params,
    max: num(a.max), question: q ? q.text : '',
    credit, deductions,
    guidance: children(block, 'Guidance').filter(g => !g.a.use).map(g => g.text),
    deriveFromClauses: TRUE.has(a.deriveFromClauses ?? ''),
    asks: a.asks, cadence: params.cadence, expectedType: a.expectedType,
    // FROM `<Context item="..."/>` CHILDREN, not an attribute -- 2a has none of
    // the latter and every cross-reference came out empty.
    contextKeys: children(block, 'Context').map(c => c.a.item).filter(Boolean),
  }
}

// ---- the handout side: the sheet tag an item is graded by -------------------
const HANDOUT_SRC = new Map<string, string>()
for (const f of readdirSync(HANDOUTS).filter(x => /^bmod_handout\d\.olx$/.test(x))) {
  HANDOUT_SRC.set(f, readFileSync(HANDOUTS + '/' + f, 'utf8'))
}
function sheetTag(action: string): { file: string; tag: string } | null {
  for (const [file, src] of HANDOUT_SRC) {
    const re = new RegExp(`<(?:LLMAction|DerivedChecks)\\b[^>]*?\\bid="${action}"[^>]*?/?>`, 's')
    const m = re.exec(src)
    if (m) return { file, tag: m[0] }
  }
  return null
}

// ---- course.json: the generator fields -------------------------------------
const GEN = new Map<string, any>()
for (const it of course.items) GEN.set(String(it.id), detag(it))
// A PAIR LIST, not an object: the export writes declarations as [key, value]
// pairs. Read as an object it is empty, and every blurb comes back undefined.
const HANDOUT_FIELDS: Record<string, any> = {}
for (const [k, v] of detag(course.declarations.HANDOUT_FIELDS ?? [])) HANDOUT_FIELDS[k] = v
const CONTEXT_REFS = detag(course.generator.CONTEXT_REFS ?? {})
const CONTEXT_NON_ITEM = detag(course.generator.CONTEXT__non_item ?? {})

/** The CONTEXT table python builds: item fields plus the non-item sections. */
function contextTable(): Record<string, Array<[string, string]>> {
  const out: Record<string, any> = {}
  for (const [id, g] of GEN) if (g.prompt_context) out[id] = g.prompt_context
  for (const k of Object.keys(CONTEXT_NON_ITEM)) out[k] = CONTEXT_NON_ITEM[k]
  return out
}
const CONTEXT = contextTable()

/** `<Choices name= options=/>` at rubric level -- SLOT_OPTIONS' new home. */
const CHOICE_SETS: Record<string, string[]> = {}
for (const m of bare.matchAll(/<Choices\s+name="([^"]+)"\s+options="([^"]*)"\s*\/>/g)) {
  CHOICE_SETS[m[1]] = m[2].split(',').map(x => x.trim()).filter(Boolean)
}

/** A rubric child element's rows, as the attribute assemblers take them. */
function itemField(r: any, tag: string, _keys: string[]): any[] {
  return children(r.block, tag).map(x => ({ ...x.a }))
}

// ---- the judging note, resolved --------------------------------------------
const FAIL = /\{fail(?::([A-Za-z0-9_]+))?\}/g
function noteFor(item: any, slots: any[], key: string,
                 credit: any[]): string | undefined {
  const failToken = (k: string) => {
    const sl = slots.find(x => x.key === k)
    const opts = (sl?.options ?? []).filter((o: string) => o !== 'met' && o !== 'absent')
    return opts.length ? opts[0] : 'absent'
  }
  const fill = (text: string, own: string) =>
    text.replace(FAIL, (_m, named) => failToken(named || own))
  const c = credit.find(x => x.what === key)
  if (c?.rule) return fill(c.rule, key)
  const scoped = notesStore[item.id + ':' + key] ?? notesStore[key]
  if (scoped) {
    const have = new Set(item.conds)
    const parts = scoped.filter(sg => {
      if (!sg.when) return true
      const neg = sg.when.startsWith('!')
      const name = neg ? sg.when.slice(1) : sg.when
      return neg ? !have.has(name) : have.has(name)
    })
    if (parts.length) return parts.map(x => x.text).join('')
  }
  return c?.desc
}

// ---- assemble the whole input set ------------------------------------------
const out: any = { _fragments: fragments, _frame: frame, _handAuthoredAttrs: [] }
for (const [id] of BLOCKS) {
  const r = rubricItem(id)
  if (!r.asks) continue
  const found = sheetTag(r.asks)
  if (!found) continue
  const a = attrs(found.tag)
  const defaults = (a.verdicts ?? '').split(',').map(x => x.trim()).filter(Boolean)
  const slots = parseSlots(a.slots ?? '', defaults.length ? defaults : undefined)
  const g = GEN.get(id) ?? {}
  const handout = String(g.handout ?? '')

  const notes: Record<string, string> = {}
  for (const sl of slots) {
    const n = noteFor(r, slots, sl.key, r.credit)
    if (n) notes[sl.key] = n
  }

  // THE REF IDS ARE IN THE SHIPPED BODY. python keeps them in a literal table;
  // they are simply the `<Ref id= target=>` elements the body already carries, so
  // they are read back rather than restated.
  const bodyRe = new RegExp(`<LLMAction\\b[^>]*?\\bid="${r.asks}"[^>]*>([\\s\\S]*?)</LLMAction>`)
  const bodyM = bodyRe.exec(HANDOUT_SRC.get(found.file) ?? '')
  const refId = new Map<string, string>()
  for (const m of (bodyM ? bodyM[1] : '').matchAll(/<Ref\s+id="([^"]+)"\s+target="([^"]+)"\s*\/>/g)) {
    refId.set(m[2], m[1])
  }
  const ref = (target: string) => ({ refId: refId.get(target) ?? '', target })

  const seen = new Set<string>()
  const sections: any[] = []
  if (r.conds.includes('reads_utb_choice')) {
    sections.push({ heading: 'The behavior they chose from the list',
                    body: 'Chosen from the four on the list, before question 1.',
                    field: NUL + 'REF:' + (refId.get('bmod_h1_utb') ?? '') + ':bmod_h1_utb' + NUL })
    seen.add('bmod_h1_utb')
  }
  const context: any[] = []
  for (const k of (r.contextKeys ?? [])) {
    const fields = (CONTEXT[k] ?? []).filter(([, t]: any) => !seen.has(t))
    for (const [, t] of fields) seen.add(t)
    if (fields.length) {
      context.push({ heading: k,
                     lines: fields.map(([l, t]: any) => ({ label: l, ...ref(t) })) })
    }
  }
  const ev = g.prompt_evidence
    ? { note: g.prompt_evidence[0],
        refs: g.prompt_evidence[1].map(([l, t]: any) => ({ label: l, ...ref(t) })) }
    : null

  // `_item_conditions` plus criterion 10's plain form -- the web path calls
  // `_criteria_section` with neither slot flag, and that call adds it.
  const cond: string[] = []
  if (r.conds.includes('avoidance_scores')) cond.push('avoidance_scores')
  if (r.cadence) { cond.push('cadence_' + r.cadence, 'has_cadence') }
  if (r.deriveFromClauses && r.cadence) cond.push('criterion_10_plain')
  cond.sort()

  out[id] = {
    handoutFile: found.file,
    action: r.asks,
    blurb: (HANDOUT_FIELDS[handout] ?? {}).blurb,
    webSystem: fragments.webSystem,
    item: {
      id, max: r.max, question: r.question, credit: r.credit,
      deductions: r.deductions, guidance: r.guidance,
      deriveFromClauses: r.deriveFromClauses,
      itemNotes: g.prompt_notes ?? null,
      termDefinition: g.prompt_match_def ?? null,
      omitGuidance: (g.prompt_omit_guidance
        ? r.guidance.map((t: string, i: number) => [t, i])
            .filter(([t]: any) => Object.keys(g.prompt_omit_guidance)
              .some(frag => String(t).startsWith(frag)))
            .map(([, i]: any) => i).sort((x: number, y: number) => x - y)
        : []),
      omitCredit: [],
      conditions: cond, frameParams: {},
    },
    slots,
    notes,
    rules: {
      counts: parseCounts(a.counts), maps: parseMaps(a.maps),
      forbid: parseForbid(a.forbid), equals: parseEquals(a.equals),
      expect: parseExpect(a.expect), derived: parseDerived(a.derived),
      choices: parseChoices(a.choices),
    },
    // ATTRIBUTES ARE NOT BUILT HERE YET, and the omission is deliberate rather
    // than forgotten: `assemble-prompts` treats absent `attrInputs` as bodies-only.
    // Each rubric child element needs shaping for its own assembler -- <Counts>
    // carries `slots` as a comma string where `countsAttr` takes an array -- and a
    // half-shaped one crashes rather than mis-writing, which is the right failure
    // but not a finished job. The attribute path still runs from the python dump,
    // where it is proved at 322 of 322.
    sections, context, evidence: ev,
    response: (g.prompt_response ?? []).map(([l, t]: any) => ({ label: l, ...ref(t) })),
  }
}
console.log(JSON.stringify(out, null, 1))
