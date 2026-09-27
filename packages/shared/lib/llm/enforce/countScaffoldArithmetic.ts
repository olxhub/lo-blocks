// A count scaffold whose three numbers contradict each other.
//
// Ported from `enforcement.check_count_scaffolds_are_arithmetic` (goal K).
//
// THE SCAFFOLD EXISTS SO THE MODEL DECOMPOSES ITS JUDGEMENT: how many it
// listed, how many of those fail, how many it therefore credits. The slots
// define the third as exactly the first minus the second.
//
// WHY CHECK RATHER THAN RECOMPUTE. Deriving `given` from the other two would
// make the arithmetic unbreakable and throw the decomposition away -- a model
// that miscounts the parts would silently get the total computed from them,
// which is worse than one that reports a triple you can see is impossible.
//
// ONLY THE THIRD IS SCORED, so a contradiction costs nothing and shows in no
// rate. That is why it needs a check rather than a reader.

export type CountScaffoldPayload = {
  artifacts: Array<{
    /** `<dir>/<file>`, as the finding names it. */
    label: string;
    runs: Array<{
      results: Array<{
        cell: string | number | null;
        /** Answers merged with verdicts, as python reads them. */
        values: Record<string, unknown>;
      }>;
    }>;
  }>;
};

const STEMS = ['reasons', 'benefits', 'harms'];

/** python's `int(str(x))`: an int only if the whole string is one. */
function asInt(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (!/^[+-]?\d+$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

export function countScaffoldArithmetic(p: CountScaffoldPayload): string[] {
  const out: string[] = [];
  for (const art of p.artifacts ?? []) {
    // ENUMERATED FROM 1, as python does. The finding names a run the way a
    // reader counts them, and an off-by-one makes two engines disagree about
    // which run is at fault.
    const runs = art.runs ?? [];
    for (let i = 0; i < runs.length; i++) {
      const ri = i + 1;
      for (const r of runs[i].results ?? []) {
        const v = r.values ?? {};
        for (const stem of STEMS) {
          const L = asInt(v[`${stem}_listed`]);
          const F = asInt(v[`${stem}_failing`]);
          const G = asInt(v[`${stem}_given`]);
          if (L === null || F === null || G === null) continue;
          if (L - F === G) continue;
          out.push(
            `${art.label} run ${ri} cell ${r.cell}: \`${stem}_listed\` ${L} ` +
            `minus \`${stem}_failing\` ${F} is not \`${stem}_given\` ${G}, and ` +
            `the slots define it as exactly that. Only the third is scored, so ` +
            `this costs nothing and shows in no rate -- which is why it needs a ` +
            `check rather than a reader`);
        }
      }
    }
  }
  return out;
}
