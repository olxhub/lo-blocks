// Does the WEB BLOCK accept every attribute the OLX authors on <LLMAction>?
//
// Ported from `enforcement.check_action_attributes_are_declared_in_the_block`
// (goal K).
//
// THE SCHEMA IS `.strict()`, so an attribute it does not declare does not
// degrade the block -- it REPLACES it with an ErrorNode. The button still
// renders, with nothing behind it. Clicking does nothing, no status is ever
// written, and the runner waits out its timeout and reports `no-cell`.
//
// THAT COST SEVEN ITEMS OF A TWO-SIDED SWEEP, every cell, silently. `forbid` was
// implemented in slotSheet.ts, parsed in LLMAction.ts, declared in
// primitives.json, parsed by the python harness, covered by unit tests -- and
// never added to the block's attribute schema. `maps` was the same. Every
// existing check passed, because every existing check looked at ONE SIDE.
//
// AND IT SURVIVES A RE-DUMP: the error is baked into the idmap at parse time,
// so a prompt-text freshness check reports those items as fine.
//
// PORTING MOVED THE READER TO THE RIGHT SIDE, exactly as it did for
// `runtimeParsesFailsVerdict`: python was reaching across the repository
// boundary to grep an engine file for an engine schema. The block belongs to
// lo-blocks and so does the check on it.

export type ActionAttrsPayload = {
  /** The block source, and the name to use in messages. */
  blockName: string;
  blockSrc: string;
  /**
   * `attribute -> where it is authored`, one entry per authored attribute.
   * Null when lo-blocks is absent, which is silence rather than a finding.
   */
  used: Record<string, string[]> | null;
};

export function actionAttributesAreDeclared(p: ActionAttrsPayload): string[] {
  if (!p?.used) return [];                 // lo-blocks absent on this machine
  const name = p.blockName || 'LLMAction.ts';
  const m = /attributes:\s*z\.object\(\{([\s\S]*?)\}\)\.strict\(\)/.exec(p.blockSrc ?? '');
  if (!m) {
    return [
      `${name}: cannot find the \`attributes: z.object({...}).strict()\` ` +
      `block, so undeclared attributes cannot be detected`];
  }
  // FOUR-SPACE KEYS ONLY, as python matches: the top level of the object
  // literal. A looser match would take nested schema keys and declare an
  // attribute that the block does not actually accept.
  const declared = new Set<string>(
    [...m[1].matchAll(/^ {4}(\w+):/gm)].map(x => x[1]));
  declared.add('id');
  declared.add('target');

  const out: string[] = [];
  for (const attr of Object.keys(p.used).sort()) {
    if (declared.has(attr)) continue;
    const sites = [...p.used[attr]].sort();
    const where = sites.slice(0, 4).join(', ');
    out.push(
      `<LLMAction ${attr}="..."> is authored on ${sites.length} action(s) ` +
      `(${where}) but is NOT declared in LLMAction.ts's attributes schema, ` +
      `which is .strict(). Every one of those blocks becomes an ErrorNode ` +
      `at parse time: the button renders, the click does nothing, and the ` +
      `cell times out as \`no-cell\` with no error anywhere. Declare it`);
  }
  return out;
}
