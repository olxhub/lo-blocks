// Declarations the recorded measurements have outgrown.
//
// Ported from `measured.declaration_conflicts` (goal K), SPLIT: python decides
// WHICH declarations are in question and gathers each one's per-side run
// counts; this decides what those counts MEAN and says it.
//
// A DECLARATION IS A PREDICTION. A divergence predicts a miss we mean to keep,
// a ceiling predicts an item cannot be perfect, an exclusion predicts a cell
// should not count. Predictions expire, and an expired one leaves no trace --
// the cell has stopped producing an error, so there is nothing to notice. It
// just subtracts itself from every rate, indefinitely.
//
// THE EVENTS ARRIVE IN OUTPUT ORDER, and the payload is built where python
// APPENDS rather than where it computes. Measured while porting: instrumenting
// the computation logged THREE claims where only TWO reached the output -- the
// third was computed and then suppressed by a later guard. A payload built at
// computation time would have invented a finding that python does not make.
//
// SIX RUNS IS THE THRESHOLD, and below it the verdict changes rather than
// disappearing: a handful of runs cannot settle a per-cell claim, so the
// instruction becomes "probe it at six passes with controls" instead of
// "retire it". Reporting a 2/2 contradiction as settled is how a declaration
// gets retired on noise.

export type DeclarationEvent =
  /** A finding python composed itself; passed through verbatim. */
  | { kind: 'text'; text: string }
  /** One declaration, with its (right, runs) pair per measured side. */
  | { kind: 'split'; what: string; action: string; got: Record<string, [number, number]> }
  /** A single-sided verdict, already reduced to one pair. */
  | { kind: 'verdict'; what: string; right: number; runs: number; action: string };

export type DeclarationConflictsPayload = { events: DeclarationEvent[] };

/** python's `action[:1].lower() + action[1:]` -- NOT `.lower()`: "Q6/p5" is a name. */
const lead = (action: string): string =>
  action.slice(0, 1).toLowerCase() + action.slice(1);

export function verdict(what: string, right: number, runs: number, action: string): string {
  if (runs >= 6) {
    return `${what} is contradicted by ${right}/${runs} recorded runs. ${action}`;
  }
  return (
    `${what} is contradicted by ${right}/${runs} recorded runs, but ` +
    `${runs} runs cannot settle a per-cell claim (see Q2/p17). Probe ` +
    `it at six passes with controls; if it holds, ${lead(action)}`);
}

/** One message for a declaration measured on more than one side. */
export function splitVerdict(
  what: string, action: string, got: Record<string, [number, number]>,
): string | null {
  const entries = Object.entries(got);
  const against = entries.filter(([, v]) => v[0] >= v[1]);
  if (!against.length) return null;
  const holds = entries.filter(([, v]) => v[0] < v[1]);
  const fmt = (xs: Array<[string, [number, number]]>) =>
    xs.slice().sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([s, v]) => `${s} ${v[0]}/${v[1]}`).join(', ');

  if (!holds.length) {
    // EVERY measured side. The WORST pair carries the verdict -- the fewest
    // runs -- because that is the weakest evidence the claim rests on.
    let worst = against[0][1];
    for (const [, v] of against) if (v[1] < worst[1]) worst = v;
    return verdict(`${what} on EVERY measured side (${fmt(against)})`,
                   worst[0], worst[1], action);
  }
  // A SPLIT IS NOT A RETIREMENT: the declaration is still true where it holds.
  return (
    `${what} on ${fmt(against)}, but still holds on ${fmt(holds)}. A declaration true on ` +
    `one path and false on another is a finding about the PATHS: ` +
    `scope the entry to the side it describes, or bring the lagging ` +
    `side up and then ${lead(action)}`);
}

export function declarationConflicts(p: DeclarationConflictsPayload): string[] {
  const out: string[] = [];
  for (const ev of p?.events ?? []) {
    if (ev.kind === 'text') { out.push(ev.text); continue; }
    if (ev.kind === 'split') {
      const m = splitVerdict(ev.what, ev.action, ev.got);
      if (m) out.push(m);
      continue;
    }
    out.push(verdict(ev.what, ev.right, ev.runs, ev.action));
  }
  return out;
}
