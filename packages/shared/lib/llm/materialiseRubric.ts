// Turning a rubric that CONTAINS templates into one made only of literal items.
//
// This runs in the BUILD, once, and what it writes is what every reader sees.
// The alternative -- expanding at read time -- means every program that reads
// the generated content needs the template grammar, and a second implementation
// of one rule is the drift this whole model exists to end.
//
// It is deliberately small. Resolving `use="@name"`, splitting two attribute
// strings, and calling the expander is all there is: the substitution and
// selection rules live in `itemTemplate.ts` and are not repeated here.

import { expandItem, unusedParams, TemplateError } from './itemTemplate'
import type { ItemTemplate, ItemDecl, ExpandedNode, TemplateNode } from './itemTemplate'

/** A node as the parser hands it over: a tag, its attributes, its children. */
export interface RubricNode {
  kind: string
  attrs?: Record<string, string>
  text?: string
  children?: RubricNode[]
}

/**
 * `params="a=b|c=d"` -> `{a: 'b', c: 'd'}`.
 *
 * SPLIT ON THE FIRST `=` ONLY. A value may contain one -- a definition, a rule,
 * a sentence with an equation in it -- and splitting on every `=` would truncate
 * it silently at the first.
 */
export function parseParams(spec: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (spec ?? '').split('|')) {
    const s = part.trim()
    if (!s) continue
    const at = s.indexOf('=')
    if (at < 0) {
      throw new TemplateError(`params entry ${JSON.stringify(s)} has no "="`)
    }
    out[s.slice(0, at).trim()] = s.slice(at + 1)
  }
  return out
}

/** `conditions="a|b"` -> `['a', 'b']`. */
export function parseConditions(spec: string | undefined): string[] {
  return (spec ?? '').split('|').map(s => s.trim()).filter(Boolean)
}

const deref = (v: string): string => (v.startsWith('@') ? v.slice(1) : v)

/**
 * Expand every templated item in a rubric, and drop the templates.
 *
 * Returns literal nodes only. An item WITHOUT `use` passes through untouched --
 * not every item is templated, and forcing all of them through a template would
 * be worse than the helpers this replaces.
 */
export function materialiseRubric(nodes: RubricNode[]): RubricNode[] {
  const templates = new Map<string, ItemTemplate>()
  for (const n of nodes) {
    if (n.kind !== 'ItemTemplate') continue
    const name = n.attrs?.name
    if (!name) throw new TemplateError('an ItemTemplate has no name')
    if (templates.has(name)) {
      // Silently keeping the last would make an edit to the first have no
      // effect, which is the least debuggable outcome available.
      throw new TemplateError(`two ItemTemplates are both named ${JSON.stringify(name)}`)
    }
    templates.set(name, {
      name,
      nodes: (n.children ?? []).map(c => ({
        // `ifDeclared`, NOT `cond`: `cond` is REAL DATA on some children --
        // <Onlyif key="x" cond="y"> means "charge x only while y holds" -- so a
        // template marker of the same name would be read as that, and stripped
        // from the output as if it had been consumed. One word cannot mean both
        // "include this node" and "this check depends on that one".
        kind: c.kind, attrs: c.attrs, text: c.text, cond: c.attrs?.ifDeclared,
      } as TemplateNode)),
    })
  }

  const out: RubricNode[] = []
  const used = new Set<string>()
  for (const n of nodes) {
    if (n.kind === 'ItemTemplate') continue          // dropped: it was the source
    if (n.kind !== 'Item' || !n.attrs?.use) { out.push(n); continue }

    const name = deref(n.attrs.use)
    const tpl = templates.get(name)
    if (!tpl) {
      throw new TemplateError(
        `item ${n.attrs.scores ?? '(unnamed)'} uses template ` +
        `${JSON.stringify(name)}, which this rubric does not declare`)
    }
    used.add(name)
    // ATTRIBUTE FORM AND ELEMENT FORM MERGE. The attribute is right for
    // identifiers; <Param> is right for prose, which the attribute grammar
    // cannot carry -- it is delimited by `|` and `=`, and sentences contain
    // both. A name given twice is an error: silently preferring one would make
    // an edit to the other do nothing.
    const fromAttr = parseParams(n.attrs.params)
    const fromKids: Record<string, string> = {}
    for (const c of n.children ?? []) {
      if (c.kind !== 'Param') continue
      const pname = c.attrs?.name
      if (!pname) throw new TemplateError(`${n.attrs.scores}: a <Param> has no name`)
      if (pname in fromKids || pname in fromAttr) {
        throw new TemplateError(
          `${n.attrs.scores}: parameter ${JSON.stringify(pname)} is given twice`)
      }
      fromKids[pname] = c.text ?? ''
    }
    const decl: ItemDecl = {
      scores: n.attrs.scores ?? '',
      use: name,
      max: n.attrs.max === undefined ? undefined : Number(n.attrs.max),
      conditions: parseConditions(n.attrs.conditions),
      params: { ...fromAttr, ...fromKids },
    }
    const spare = unusedParams(tpl, decl)
    if (spare.length) {
      // Not fatal: a param nobody reads changes nothing. Reported because it is
      // invisible otherwise -- filling never touches it -- and it is usually a
      // rename that half-landed.
      warnings.push(`${decl.scores}: params nothing asks for: ${spare.join(', ')}`)
    }
    const ex = expandItem(tpl, decl)
    const attrs: Record<string, string> = { scores: ex.scores }
    if (ex.max !== undefined) attrs.max = String(ex.max)
    out.push({
      kind: 'Item',
      attrs,
      children: ex.nodes.map((e: ExpandedNode) => ({
        kind: e.kind,
        // `ifDeclared` was consumed by expansion; leaving it would invite a
        // second pass to re-evaluate a decision already made. Every OTHER
        // attribute survives, including a child's own `cond`.
        attrs: Object.fromEntries(
          Object.entries(e.attrs).filter(([k]) => k !== 'ifDeclared')),
        text: e.text,
      })),
    })
  }

  for (const name of Array.from(templates.keys())) {
    if (!used.has(name)) warnings.push(`template ${JSON.stringify(name)} is used by no item`)
  }
  return out
}

/** Non-fatal observations from the last run, in order. */
export const warnings: string[] = []

/** Clear them. The build reports per document, not cumulatively. */
export function resetWarnings(): void { warnings.length = 0 }
