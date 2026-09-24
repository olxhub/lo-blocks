/**
 * Sheet attributes, generated from the rubric.
 *
 * The other half of the assembler: `promptAssembler.ts` produces the prose a
 * grader reads, this produces the attributes that decide SCORING. The asymmetry
 * of consequence is why they belong in one gate -- a wrong word changes a
 * prompt, a wrong `maps=` changes a score, silently (R5).
 *
 * Each function returns `null` where the item declares no such rule, matching
 * the generator: an EMPTY attribute and an ABSENT one are different bytes.
 *
 * Content-neutral (C2): every grammar below is an engine concept; the slot and
 * verdict names threaded through them are data the caller supplies.
 */

const joinRules = (xs: string[]): string | null => xs.length ? xs.join('|') : null

/** `counts="key:slotA,slotB"` */
export function countsAttr(rules: Array<{ key: string; slots: string[] }>) {
  return joinRules(rules.map(r => `${r.key}:${r.slots.join(',')}`))
}

/** `onlyif="key:cond"` */
export function onlyifAttr(rules: Array<{ key: string; cond: string }>) {
  return joinRules(rules.map(r => `${r.key}:${r.cond}`))
}

/** `requires="key:cond:lenient,..."` */
export function requiresAttr(
  rules: Array<{ key: string; cond: string; lenient?: string[] }>) {
  return joinRules(rules.map(r =>
    `${r.key}:${r.cond}` + (r.lenient?.length ? ':' + r.lenient.join(',') : '')))
}

/** `equals="key:left,right:lenient,..."` */
export function equalsAttr(
  rules: Array<{ key: string; left: string; right: string; lenient?: string[] }>) {
  return joinRules(rules.map(r =>
    `${r.key}:${r.left},${r.right}` + (r.lenient?.length ? ':' + r.lenient.join(',') : '')))
}

/** `expect="key:left=value[:lenient,...]"` */
export function expectAttr(
  rules: Array<{ key: string; left: string; value: string; lenient?: string[] }>) {
  return joinRules(rules.map(r =>
    `${r.key}:${r.left}=${r.value}` + (r.lenient?.length ? ':' + r.lenient.join(',') : '')))
}

/**
 * `rubricDef="Q1"` -- the rubric entry this generated sheet is a projection OF.
 *
 * THE VALUE IS THE ITEM ID because that is already the rubric entry's identity,
 * and a function rather than a bare field access so the attribute has ONE
 * producer: the point of naming the source is that a second consumer can derive
 * its own projection instead of restating this one, which is undone if each
 * consumer spells the derivation itself.
 */
export function rubricDefAttr(itemId: string | null | undefined): string | null {
  return itemId ? itemId : null
}

/** `cover="keyA,keyB:labelA,labelB"` — `of` and `verdicts` are deliberately dropped. */
export function coverAttr(rules: Array<{ keys: string[]; labels: string[] }>) {
  return joinRules(rules.map(r => `${r.keys.join(',')}:${r.labels.join(',')}`))
}

/** `forbid="key:slot=value,slot=value"` */
export function forbidAttr(
  rules: Array<{ key: string; conds: Array<{ slot: string; value: string }> }>) {
  return joinRules(rules.map(r =>
    `${r.key}:${r.conds.map(c => `${c.slot}=${c.value}`).join(',')}`))
}

/** `maps="key:pick:value~verdict,...,*~fallback"` */
export function mapsAttr(rules: Array<{
  key: string; pick: string
  pairs: Array<{ value: string; verdict: string }>
  fallback?: string
}>) {
  return joinRules(rules.map(r => {
    const pairs = r.pairs.map(c => `${c.value}~${c.verdict}`)
    if (r.fallback) pairs.push(`*~${r.fallback}`)
    return `${r.key}:${r.pick}:${pairs.join(',')}`
  }))
}

/**
 * `free="slot:verdict,verdict|slot:verdict"` — verdicts that cost NOTHING.
 *
 * Read off the CREDIT entries, not off a rule list, and DECLARED rather than
 * inferred: "a verdict with no code is free" is wrong wherever a code is keyed
 * on a counterpart name.
 */
export function freeAttr(credit: Array<{ what: string; free?: string[] }>) {
  const out: string[] = []
  for (const c of credit) {
    const free = (c.free ?? []).filter(Boolean)
    if (free.length) out.push(`${c.what}:${free.join(',')}`)
  }
  return joinRules(out)
}

/** A slot clause as the rubric's SLOT_SPEC declares it. */
export interface SlotClause {
  key: string
  gate?: boolean
  label?: string
  seg?: string | null
  pts?: number | null
}

/**
 * `slots="[!]key:label[:seg][@pts]"`.
 *
 * Emission mirrors `parse_slots` exactly. Note the label rule: a clause gets a
 * `:label` segment when it has a label OR a `seg`, and an empty label then
 * renders as an empty segment -- `key::seg`. Dropping the empty segment would
 * shift `seg` into the label position and change every sheet that uses one.
 */
export function slotsAttr(rules: SlotClause[]): string | null {
  if (!rules.length) return null
  const out = rules.map(f => {
    let clause = (f.gate ? '!' : '') + f.key
    if (f.label || f.seg != null) clause += ':' + (f.label ?? '')
    if (f.seg != null) clause += ':' + f.seg
    if (f.pts != null) clause += '@' + String(f.pts)
    return clause
  })
  return out.join('|')
}

/** `%g`-style: 3 not 3.0, 2.5 stays 2.5. */
const num = (v: number | string): string => {
  const f = Number(v)
  return Number.isInteger(f) ? String(Math.trunc(f)) : String(f)
}

export interface DerivedRule {
  key: string
  kind: string
  fields?: string[]
  words?: string[]
  template?: Array<Array<number | string>>
}

/**
 * `derived="key:kind:fields:payload"`.
 *
 * A rule with NO `fields` emits nothing rather than a malformed clause: there
 * is no box list to tell the web about, and inventing one would put a field id
 * into a prompt on a guess. An unknown `kind` is skipped for the same reason --
 * silently, matching the generator, because the grammar is validated elsewhere.
 */
export function derivedAttr(rules: DerivedRule[]): string | null {
  const out: string[] = []
  for (const r of rules) {
    const fields = r.fields
    if (!fields || !fields.length) continue
    let payload: string
    if (r.kind === 'contains') payload = (r.words ?? []).join(',')
    else if (r.kind === 'complete' || r.kind === 'plots')
      payload = (r.template ?? []).map(row => row.map(num).join(',')).join(';')
    else continue
    out.push(`${r.key}:${r.kind}:${fields.join(',')}:${payload}`)
  }
  return out.length ? out.join('|') : null
}

/**
 * `max="N"` -- THE VALUE is generated, THE PRESENCE is preserved.
 *
 * This inverts the module's usual rule deliberately. The rubric declares `max`
 * for 23 items; the .olx carries the attribute on 11, and the app computes the
 * rest from the slots' points. Emitting it everywhere would ADD an attribute to
 * twelve items, moving twelve prompt_shas for ZERO behavioural change.
 *
 * `alreadyPresent` is therefore the CALLER's to answer, by reading the shipped
 * tag. The assembler must not read the .olx itself: that would make a leaf
 * module in lo-blocks depend on the content repository's bytes, which is the
 * boundary C2 draws.
 */
export function maxAttr(max: number | null | undefined,
                        alreadyPresent: boolean): string | null {
  if (!alreadyPresent || max == null) return null
  return num(max)
}

/**
 * `choices="set:a,b,c"` -- the menus a `pick()` slot offers.
 *
 * GENERATES WHAT IT CAN SOURCE, PRESERVES WHAT IT CANNOT. A set whose slots
 * carry rubric verdicts is regenerated from them; a set with no rubric
 * declaration keeps the shipped membership verbatim. Order is the shipped
 * attribute's for preserved sets and the rubric's for generated ones, so
 * switching this on rewrites only the sets that actually differ.
 *
 * `declared` and `users` both come from the SHIPPED TAG, so the caller reads
 * them -- the same boundary `maxAttr` draws. This module never opens an .olx.
 *
 * It REFUSES rather than inventing, in both directions: a set with no members
 * and no rubric source has no menu to emit, and two slots sharing a set while
 * declaring different verdicts is a contradiction the generator will not
 * resolve by picking one.
 */
export function choicesAttr(o: {
  declared: Record<string, string[]>
  users: Record<string, string[]>
  sourced: Record<string, string[] | null | undefined>
  itemId: string
}): string | null {
  const { declared, users, sourced, itemId } = o
  if (!Object.keys(declared).length) return null
  const order = [...Object.keys(declared),
                 ...Object.keys(users).filter(g => !(g in declared))]
  const out: string[] = []
  for (const setname of order) {
    const members = declared[setname] ?? []
    const from = (users[setname] ?? [])
      .map(k => sourced[k])
      .filter((x): x is string[] => Array.isArray(x) && x.length > 0)
    if (!from.length) {
      if (!members.length) {
        throw new Error(itemId + ': slots= binds ' + (users[setname] ?? []).join(', ')
          + " to choice-set '" + setname + "', which the .olx does not declare and"
          + ' the rubric does not source. The generator will not invent a menu.')
      }
      out.push(setname + ':' + members.join(','))
      continue
    }
    const first = [...from[0]].sort().join(' ')
    if (from.some(x => [...x].sort().join(' ') !== first)) {
      throw new Error(itemId + ": slots share choice-set '" + setname
        + "' but declare different verdicts in the rubric. Reconcile them;"
        + ' the generator will not choose.')
    }
    const want = from[0]
    const kept = members.filter(m => want.includes(m))
    const added = want.filter(v => !members.includes(v))
    out.push(setname + ':' + [...kept, ...added].join(','))
  }
  return out.join('|')
}
