// Does the CLI path send the same prompt the app sends?
//
// Ported from `enforcement.check_the_cli_sends_the_apps_prompt` (goal K), SPLIT.
//
// The two paths are built to SHARE their text rather than to resemble it: both
// read the same OLX action body, and the mirror LIFTS each guidance block's
// literal text out of `slotSheet.ts` rather than keeping a copy, because a copy
// is the thing that drifts -- three times, each found by chasing a score.
//
// THE GAP LIFTING LEAVES, which is what this judges. The mirror HARDCODES which
// blocks it composes and in what order. If the app grows a third block, or
// reorders, or renames, every individual lift still succeeds and the composed
// prompts silently differ. Nothing was checking the composition itself.
//
// WHY THE SPLIT FALLS HERE. Reading `slotSheetGuidance` out of `slotSheet.ts` is
// the ENGINE reading its own source, so the assembler does it natively. What the
// MIRROR composes, and whether each block still lifts to more than an empty
// match, are facts about python -- so python passes them.
//
// IT DOES NOT DIFF THE PROMPTS TOKEN BY TOKEN, deliberately. The only sanctioned
// difference is the cover vocabulary, and `COVER VOCAB DIFFERS` already polices
// that per slot with the mapping written into it. Duplicating it here would put
// the same bridge in two places, which is how a bridge stops being one.

export type CliPromptPayload = {
  /** Why `slotSheet.ts` could not be read at all, if it could not. */
  readError?: string | null;
  /** The guidance functions `slotSheetGuidance()` calls, IN ORDER. */
  called: string[] | null;
  /** What the python mirror composes, in its own order. */
  expected: string[];
  /** Each branch of the mirror, and how many characters it lifted. */
  lifted: Array<{ showChecks: boolean; chars: number; error?: string | null }>;
};

/** Below this a block has matched empty rather than lifted its text. */
const MIN_LIFT = 200;

export function cliSendsTheAppsPrompt(p: CliPromptPayload): string[] {
  const out: string[] = [];
  if (p?.readError) {
    return [`could not read slotSheet.ts to compare the prompt paths: ${p.readError}`];
  }
  if (p?.called == null) {
    return ['slotSheetGuidance() not found in slotSheet.ts -- the CLI mirrors a ' +
            'composition that no longer exists, so the two paths cannot be compared'];
  }
  const expected = p.expected ?? [];
  if (JSON.stringify(p.called) !== JSON.stringify(expected)) {
    out.push(
      'slotSheetGuidance() now composes ' +
      `[${p.called.map(c => `'${c}'`).join(', ')}] but agreement.checklist_guidance composes ` +
      `[${expected.map(c => `'${c}'`).join(', ')}]. Every ` +
      'individual block still lifts cleanly, so the prompts differ silently: ' +
      'fix the mirror in agreement.checklist_guidance to match this order');
  }
  for (const l of p.lifted ?? []) {
    if (l.error) {
      out.push(`a guidance block no longer lifts out of slotSheet.ts: ${l.error}`);
      continue;
    }
    if (l.chars < MIN_LIFT) {
      out.push(`checklist_guidance(show_checks=${l.showChecks ? 'True' : 'False'}) lifted only ` +
               `${l.chars} chars -- a block matched empty, so the ` +
               'CLI is sending less guidance than the app');
    }
  }
  return out;
}
