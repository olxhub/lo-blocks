// Does the PROMPT honour every schema-excluding primitive on every live sheet?
//
// Ported from `enforcement.check_primitive_conformance` (goal K).
//
// CHECKED EMPIRICALLY, NOT BY TRUSTING THE REGISTRY. For each primitive whose
// keys LEAVE the response schema, the generated body must do two things: not
// list those keys in the checklist the model fills, and tell the model in so
// many words not to answer them. A primitive declared as excluding keys while
// the prompt still asks for them is a schema the model cannot satisfy -- and
// the model will answer anyway, because the checklist asked.
//
// WHICH KEYS LEAVE IS THE REGISTRY'S TO SAY. This was `if attr === 'counts'`
// spelled out in two files, and one of those copies was among the three ways
// the primitive vocabulary drifted. `excludes: 'members'` means the keys are
// the group's MEMBERS (the part after the colon); anything else means the key
// is the entry's own name.
//
// IT NEEDS THE REAL RUNTIME PROMPT, which is why this could only move once
// `promptAssembler.webPrompts` existed: the question is about the string the
// grader is actually sent, not about the OLX body it is assembled from.

export type PrimitiveConformancePayload = {
  /** Attributes whose keys leave the response schema. */
  excluding: string[];
  /** attribute -> what it excludes (`members`, `key`, or null). */
  excludes: Record<string, string | null>;
  /** item -> its `<LLMAction>` open tag. */
  tags: Record<string, string>;
  /** Items that have a judging prompt at all. */
  inAction: string[];
  /** item -> the full runtime prompt. */
  prompts: Record<string, string>;
};

export function primitiveConformance(p: PrimitiveConformancePayload): string[] {
  const out: string[] = [];
  const inAction = new Set(p?.inAction ?? []);
  for (const item of Object.keys(p?.tags ?? {}).sort()) {
    const tag = p.tags[item];
    const keys: string[] = [];
    for (const attr of p.excluding ?? []) {
      const m = new RegExp(`\\b${attr}="([^"]*)"`).exec(tag);
      if (!m) continue;
      for (const entry of m[1].split('|')) {
        const parts = entry.split(':').map(x => x.trim());
        if (!parts.length || !parts[0]) continue;
        if (p.excludes?.[attr] === 'members' && parts.length > 1) {
          keys.push(...parts[1].split(',').map(x => x.trim()).filter(Boolean));
        } else {
          keys.push(parts[0]);
        }
      }
    }
    if (!keys.length) continue;
    if (!inAction.has(item)) continue;      // no prompt at all; nothing to conform to
    const body = p.prompts?.[item] ?? '';
    const at = body.indexOf('## The checklist to return');
    const checklist = at < 0 ? '' : body.slice(at + '## The checklist to return'.length);
    for (const k of keys) {
      if (new RegExp(`^- \`${escapeRe(k)}\``, 'm').test(checklist)) {
        out.push(`${item}: \`${k}\` is excluded from the schema but still `
                 + `listed in the checklist the model fills`);
      }
      if (!checklist.includes('DO NOT ANSWER') || !checklist.includes(k)) {
        out.push(`${item}: \`${k}\` is excluded from the schema and the `
                 + `prompt never tells the model not to answer it`);
      }
    }
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
