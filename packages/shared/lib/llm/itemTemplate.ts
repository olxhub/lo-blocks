// Item templates: the rubric's way of saying "these items are the same shape".
//
// WHY A SECOND MECHANISM, when `Frame` already shares prose. Measured on a
// twelve-item handout built from four helpers: the pairs differ in their SLOT
// KEYS, and one differs in a CREDIT key derived from the parameter. `Frame`
// varies words; this varies what the sheet ASKS. A prose mechanism cannot
// express it, and expanding the items literally would put ~86KB of 92-100%
// identical content in the authored source, where one shared sentence would
// then need twelve edits.
//
// TWO OPERATIONS, the same two `Frame` has, applied to structure:
//   SUBSTITUTION      `{name}` anywhere, INCLUDING inside attribute values --
//                     `key="is_{abbrev}"` is the case that forces it.
//   CONDITIONAL CHILD `cond="name"` on a child, included only where the item
//                     declares that condition. That is how one variant carries
//                     a rule its siblings do not.
//
// DIFFERENCES LIVE ON THE ITEM. Nothing outside an item says which items are
// special: no list of ids, no table keyed by item. An item declares its own
// params and conditions, and the template is inert without them.
//
// EXPANSION IS BUILD-TIME AND MATERIALISED. The generated content carries
// literal items, so every other reader -- including ones with their own parser --
// sees ordinary items and needs no template grammar at all.
//
// Content-neutral (C2): this file substitutes names and tests membership. It
// never learns what a name means.

/** One child of a template: a slot, a rule, a deduction, a block of prose. */
export interface TemplateNode {
  kind: string
  attrs?: Record<string, string>
  text?: string
  /** Include only when the item declares this condition; `!` inverts. */
  cond?: string
}

export interface ItemTemplate {
  name: string
  nodes: TemplateNode[]
}

export interface ItemDecl {
  /** What this entry scores. */
  scores: string
  use: string
  max?: number
  conditions?: string[]
  params?: Record<string, string>
}

export class TemplateError extends Error {}

const PLACEHOLDER = /\{(\w+)\}/g

/**
 * Fill `{name}` from the item's params.
 *
 * AN UNSUPPLIED PLACEHOLDER IS AN ERROR, not an empty string and not a literal.
 * A template is a promise that every hole is filled; a missing one silently
 * produces prose reading "specifically {typeName}" or, worse, a slot key of
 * `is_` that scores nothing and matches nothing.
 */
export function fill(text: string, params: Record<string, string>, where: string): string {
  return text.replace(PLACEHOLDER, (_m, key: string) => {
    if (!(key in params)) {
      throw new TemplateError(
        `${where}: the template asks for {${key}} and the item does not supply it`)
    }
    return params[key]
  })
}

/** Does the item declare this condition? `!name` inverts. */
const holds = (cond: string | undefined, declared: Set<string>): boolean => {
  if (!cond) return true
  const negated = cond.startsWith('!')
  const name = negated ? cond.slice(1) : cond
  return declared.has(name) !== negated
}

export interface ExpandedNode {
  kind: string
  attrs: Record<string, string>
  text?: string
}

/**
 * Expand one template against one item's declaration.
 *
 * Returns the literal nodes the build writes out. The item's own `scores` and
 * `max` are carried through untouched: they are the item's, not the template's.
 */
export function expandItem(
  tpl: ItemTemplate,
  item: ItemDecl,
): { scores: string; max?: number; nodes: ExpandedNode[] } {
  if (item.use !== tpl.name) {
    throw new TemplateError(
      `item ${item.scores} uses template "${item.use}" but was expanded against "${tpl.name}"`)
  }
  const params = item.params ?? {}
  const declared = new Set(item.conditions ?? [])
  const nodes: ExpandedNode[] = []
  for (const n of tpl.nodes) {
    if (!holds(n.cond, declared)) continue
    const where = `${item.scores}/${n.kind}`
    const attrs: Record<string, string> = {}
    for (const [k, v] of Object.entries(n.attrs ?? {})) {
      // COERCE: a parsed attribute is not always a string. A schema that
      // declares `pts` as a number hands back a number, and filling assumed
      // text -- so the expander worked on hand-built fixtures and broke on the
      // first real parsed document.
      attrs[fill(String(k), params, where)] = fill(String(v ?? ''), params, where)
    }
    const out: ExpandedNode = { kind: n.kind, attrs }
    if (n.text !== undefined) out.text = fill(String(n.text), params, where)
    nodes.push(out)
  }
  return { scores: item.scores, max: item.max, nodes }
}

/**
 * Params an item supplies that no segment of its template asks for.
 *
 * Not fatal, and worth reporting: a param nobody reads is usually a rename that
 * half-landed, and it is invisible otherwise because filling never touches it.
 */
export function unusedParams(tpl: ItemTemplate, item: ItemDecl): string[] {
  const asked = new Set<string>()
  for (const n of tpl.nodes) {
    for (const s of [n.text ?? '', ...Object.keys(n.attrs ?? {}), ...Object.values(n.attrs ?? {})]) {
      // `matchAll` needs a newer iteration target than an isolated compile
      // assumes; a fresh regex and a loop needs neither.
      const re = new RegExp(PLACEHOLDER.source, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(s)) !== null) asked.add(m[1])
    }
  }
  return Object.keys(item.params ?? {}).filter(p => !asked.has(p)).sort()
}
