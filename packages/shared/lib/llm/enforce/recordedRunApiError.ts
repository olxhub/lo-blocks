// A recorded run whose FEEDBACK IS AN ERROR, kept in the ledger as a score.
//
// Ported from `enforcement.check_no_recorded_run_is_an_api_error` (goal K).
//
// AN ERROR IS NOT A MEASUREMENT. A rate-limit rejection recorded as a scored
// run returned no verdicts at all, and the scorer produced a number anyway --
// a couple of hundred characters where a real run carries thousands.
//
// IT DOES NOT FAIL SAFE, which is why this refuses rather than noting. Across
// the eighteen such runs found the first time, the recorded score was zero
// seven times and FULL MARKS nine times. The error biases in both directions:
// it zeroes some cells and credits others. A defect that only zeroed would at
// least be conservative.

export type RecordedRunErrorPayload = {
  /** One entry per recorded artifact that could be read. */
  artifacts: Array<{
    item: string;
    side: string;
    runs: Array<{
      /** Results, each with the feedback text and the cell it scored. */
      results: Array<{ pid: number | null; score: number | null; feedback: string }>;
    }>;
  }>;
};

/** python's test: the feedback opens with `Error:`, or names an API error. */
function isApiError(fb: string): boolean {
  return fb.startsWith('Error:') || fb.includes('Azure API error');
}

export function recordedRunApiError(p: RecordedRunErrorPayload): string[] {
  const out: string[] = [];
  for (const art of p.artifacts ?? []) {
    for (let n = 0; n < (art.runs ?? []).length; n++) {
      for (const r of art.runs[n].results ?? []) {
        const fb = String(r.feedback ?? '');
        if (!isApiError(fb)) continue;
        // python truncates at the first `(` -- the head names the failure, the
        // parenthesis opens the provider's own message, which varies per call
        // and would make two recordings of one defect read as two defects.
        const head = fb.split('(', 2)[0].trim().slice(0, 60);
        out.push(
          `${art.item}/p${r.pid} [${art.side}] run ${n} is recorded with score ` +
          `${fmt(r.score)} but its feedback is an API ERROR (${head}). An ` +
          `error is not a measurement -- it returned no verdicts, so the score ` +
          `is whatever the scorer produces from nothing. Re-run the cell or ` +
          `drop the run; do not pool it.`);
      }
    }
  }
  return out;
}

/** python prints `None` for an absent score, and its floats keep a decimal. */
function fmt(v: number | null): string {
  if (v === null || v === undefined) return 'None';
  return Number.isInteger(v) ? `${v}.0` : String(v);
}
