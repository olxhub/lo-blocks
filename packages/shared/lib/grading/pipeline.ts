// packages/shared/lib/grading/pipeline.ts
//
// The shared grading pipeline. Both execution modes run the same stages:
//
//   findGraderInputIds → readGraderInputs → validateInputTypes
//     → buildGraderParam  (= prepareGrade)  → evaluate → normalize
//
// Submit mode (submitGrade.ts) awaits readiness and accepts async grade
// functions; immediate mode (selectGradingState.ts) evaluates synchronously
// inside a selector. Sharing preparation is the point: any check added here
// (e.g. input-type compatibility) applies to both modes by construction.
//
import { correctness, normalizeCorrectness } from '../blocks/correctness';
import { isZodCompatible, describeZodType } from '../blocks/zodCompat';
import { valueSelector } from '../state/blockValues';
import { resolveTarget } from '../state/fieldReads';
import { graderInputStateKeys } from './topology';
import { staticEntry, blueprintFor, inferKids } from '../blocks/staticDom';
import type { LoBlock, OlxJson, RuntimeProps, StateKey } from '../types';
import type {
  GradePreparation, GraderInput, GraderParams, GradingDescriptor, GradingResult,
  InputBinding, PreparedGrade, RawGraderResult,
} from './model';

/** A produced-or-failed result, local to the pipeline's input-shaping stages.
 *  Replaces the {value?, error?} optional-pair shapes whose "which field is
 *  set?" ambiguity has to be re-checked at every call. */
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Normalize a grade function's raw result for display and persistence. */
export function normalizeGraderResult(raw: RawGraderResult): GradingResult {
  return {
    correct: normalizeCorrectness(raw.correct),
    message: raw.message ?? '',
    score: raw.score,
  };
}

// ---------------------------------------------------------------------------
// Preparation stages — STATIC DOM ONLY. The dynamic (rendered) DOM is not
// an input to grading: topology comes from OlxJson in Redux (topology.ts),
// values from component state, behavior from the block registry. Grading
// therefore runs identically in selectors, analytics, replay, and server
// code, whether or not anything is mounted.
// ---------------------------------------------------------------------------


/**
 * Resolve one input to a GraderInput: live value (from the Redux snapshot),
 * bound locals API, and authoring metadata — all from the static DOM plus
 * the block registry.
 */
function readGraderInput(props: RuntimeProps, state: unknown, stateKey: StateKey): GraderInput {
  // resolveTarget resolves the static node + blueprint + target props once;
  // idPrefix on those props derives from the ADDRESSED key, so the input's
  // value getter reads the scoped instance buckets.
  const resolved = resolveTarget(state, props, stateKey);
  if (!resolved) {
    // Content still loading (ensureBlock in flight) — a transient, not an
    // answer. The caller surfaces it as a preparation error.
    throw new InputContentPending(stateKey);
  }
  const { node: olxJson, loBlock, targetProps: inputProps } = resolved;

  // valueSelector for uniform handling of withStatus / raw selectors.value;
  // reuse the target we just resolved rather than resolving the key again.
  const { value } = valueSelector(inputProps, state, stateKey, { resolved });

  return {
    stateKey,
    name: loBlock.name || olxJson.tag,
    value,
    api: bindLocals(inputProps, state, loBlock, stateKey),
    slot: olxJson.attributes.slot as string | undefined,
    valueSchema: loBlock.valueSchema,
    commitOnChange: Boolean(loBlock.commitOnChange),
  };
}

/** Bind a block's `locals` into the grade-time API: each function pre-bound to
 *  the input's (props, state, id) so a grade fn calls `api.foo(...)` cleanly. */
function bindLocals(
  inputProps: RuntimeProps, state: unknown, loBlock: LoBlock, stateKey: StateKey,
): Record<string, (...args: unknown[]) => unknown> {
  if (!loBlock.locals) return {};
  return Object.fromEntries(
    Object.entries(loBlock.locals).map(([name, fn]: [string, Function]) => [
      name,
      (...args: unknown[]) => fn(inputProps, state, stateKey, ...args),
    ]),
  );
}

export function readGraderInputs(props: RuntimeProps, state: unknown, ids: StateKey[]): GraderInput[] {
  return ids.map(id => readGraderInput(props, state, id));
}

/** An input whose content hasn't loaded yet — surfaced as a preparation
 *  error (transient; heals on the content dispatch), never as an answer. */
class InputContentPending extends Error {
  constructor(public stateKey: StateKey) {
    super(`Input content for "${stateKey}" is not loaded`);
  }
}

/**
 * Check input/grader type compatibility via Zod schemas (base-type
 * comparison — refinements narrow values without changing the wire type).
 */
function validateInputTypes(graderProps: RuntimeProps, inputs: GraderInput[]): string | null {
  const graderInputSchema = graderProps.loBlock.inputSchema;
  if (!graderInputSchema) return null;
  for (const input of inputs) {
    if (!input.valueSchema) continue;
    if (!isZodCompatible(input.valueSchema, graderInputSchema)) {
      return `${graderProps.loBlock.name} expects ${describeZodType(graderInputSchema)} input, `
        + `but ${input.name} provides ${describeZodType(input.valueSchema)}.`;
    }
  }
  return null;
}

/**
 * Map inputs to named slots: explicit slot= attributes first, then
 * positional assignment for the rest.
 */
function assignInputSlots(slots: readonly string[], inputs: GraderInput[]): Result<Record<string, GraderInput>> {
  const slotMap: Record<string, GraderInput> = {};
  const slotSet = new Set(slots);

  for (const input of inputs) {
    if (!input.slot) continue;
    if (!slotSet.has(input.slot)) {
      return { ok: false, error: `Unknown slot "${input.slot}" on input "${input.stateKey}", expected: ${slots.join(', ')}` };
    }
    if (slotMap[input.slot]) {
      return { ok: false, error: `Duplicate slot "${input.slot}" - each slot can only be assigned once` };
    }
    slotMap[input.slot] = input;
  }

  let slotIndex = 0;
  for (const input of inputs) {
    if (input.slot) continue;
    while (slotIndex < slots.length && slotMap[slots[slotIndex]]) slotIndex++;
    if (slotIndex >= slots.length) {
      return { ok: false, error: `Too many inputs: grader expects ${slots.length} (${slots.join(', ')}), found more` };
    }
    slotMap[slots[slotIndex++]] = input;
  }

  for (const slot of slots) {
    if (!slotMap[slot]) return { ok: false, error: `Missing input for slot "${slot}"` };
  }
  return { ok: true, value: slotMap };
}

/**
 * Shape inputs into the parameter the grade function expects, per the
 * binding kind (named slots / list / single).
 */
export function buildGraderParam(binding: InputBinding, inputs: GraderInput[]): Result<GraderParams> {
  if (binding.kind === 'slots') {
    const slotMap = assignInputSlots(binding.names, inputs);
    if (!slotMap.ok) return slotMap;
    const inputDict: Record<string, unknown> = {};
    const inputApiDict: Record<string, object> = {};
    for (const [slot, input] of Object.entries(slotMap.value)) {
      inputDict[slot] = input.value;
      inputApiDict[slot] = input.api;
    }
    return { ok: true, value: { inputDict, inputApiDict } };
  }
  if (binding.kind === 'list') {
    return { ok: true, value: { inputList: inputs.map(i => i.value), inputApis: inputs.map(i => i.api) } };
  }
  if (inputs.length === 0) return { ok: false, error: 'No input found' };
  return { ok: true, value: { input: inputs[0].value, inputApi: inputs[0].api } };
}

/** A grader's STATIC-DOM topology: the input keys it grades and the lazy-
 *  engine readiness covering its subtree. A pure function of the static DOM
 *  (olxjson + registry + grader key) — never of live field values. */
interface GraderTopology {
  inputKeys: StateKey[];
  ensureReady: (() => Promise<void>) | undefined;
}

// deriveImmediateState re-runs prepareGrade on every dispatch (a keystroke
// anywhere yields a fresh Redux state), so the two static-DOM walks below
// (graderInputStateKeys, collectEnsureReady — each an inferKids pass, with
// DIFFERENT selectors and boundaries, so they cannot be merged) would re-run
// per keystroke for every immediate grader on the page. Topology depends only
// on the olxjson content slice, so cache on that slice's identity (mirrors
// staticDom's selectInstanceStateKeys): the slice changes only when content
// loads — which is also the only thing that changes topology — and a WeakMap
// discards each generation once unreferenced. Runtime is a second key because
// the same content under a different registry/locale can infer a different
// topology (selectGradingState memoizes on runtime for the same reason).
const _topologyMemo = new WeakMap<object, WeakMap<object, Map<StateKey, GraderTopology>>>();

function graderTopology(
  props: RuntimeProps, state: unknown, graderKey: StateKey, entry: OlxJson, loBlock: LoBlock,
): GraderTopology {
  const compute = (): GraderTopology => ({
    inputKeys: graderInputStateKeys(state, props, graderKey),
    ensureReady: collectEnsureReady(props, state, entry, loBlock),
  });
  const slice = (state as any)?.application_state?.olxjson as object | undefined;
  if (!slice) return compute(); // no content slice to key on (analytics/replay shapes)

  const runtime = props.runtime as unknown as object;
  let byRuntime = _topologyMemo.get(slice);
  if (!byRuntime) { byRuntime = new WeakMap(); _topologyMemo.set(slice, byRuntime); }
  let byKey = byRuntime.get(runtime);
  if (!byKey) { byKey = new Map(); byRuntime.set(runtime, byKey); }
  const cached = byKey.get(graderKey);
  if (cached) return cached;
  const topology = compute();
  byKey.set(graderKey, topology);
  return topology;
}

/**
 * Given a grader node and a Redux snapshot: what exactly would we grade?
 *
 * Authoring/configuration failures come back as { ok: false } WITH the
 * resolved inputs (so callers can still record what the learner submitted);
 * broken runtime invariants throw.
 */
export function prepareGrade(
  props: RuntimeProps,
  state: unknown,
  graderKey: StateKey,
  descriptor: GradingDescriptor,
): GradePreparation {
  const resolved = resolveTarget(state, props, graderKey);
  if (!resolved) return { ok: false, inputs: [], error: 'Grader content is not loaded' };
  const { node: entry, loBlock, targetProps: graderProps } = resolved;

  // Topology (input keys + ensureReady) is static-DOM only and memoized;
  // the input VALUES read below are live, so readGraderInputs stays per-call.
  const topology = graderTopology(props, state, graderKey, entry, loBlock);

  let inputs: GraderInput[];
  try {
    inputs = readGraderInputs(props, state, topology.inputKeys);
  } catch (e) {
    if (e instanceof InputContentPending) {
      return { ok: false, inputs: [], error: `Input "${e.stateKey}" is still loading` };
    }
    throw e;
  }

  const typeError = validateInputTypes(graderProps, inputs);
  if (typeError) return { ok: false, inputs, error: typeError };

  const param = buildGraderParam(descriptor.inputs, inputs);
  if (!param.ok) return { ok: false, inputs, error: param.error };

  return {
    ok: true,
    inputs,
    prepared: {
      graderProps,
      descriptor,
      param: param.value,
      ensureReady: topology.ensureReady,
    },
  };
}

/**
 * A single ensureReady covering the grader's whole static subtree, not just
 * its own blueprint: RulesGrader's Match children (NumericalMatch,
 * FormulaMatch) declare lazy engines, and readying them HERE is what lets
 * grade functions stay synchronous — evaluation never awaits. (The render
 * gate, useBlocksReady, readies rendered blocks; this covers headless
 * callers: submit actions, analytics, server.) undefined when nothing is lazy.
 */
function collectEnsureReady(
  props: RuntimeProps, state: unknown, entry: OlxJson, loBlock: LoBlock,
): (() => Promise<void>) | undefined {
  const engineDefKeys = inferKids(state, props, entry.kids, { selector: b => Boolean(b.ensureReady) });
  const engines = [loBlock, ...engineDefKeys.map(k => {
    const kidEntry = staticEntry(state, props, k);
    return kidEntry ? blueprintFor(props, kidEntry) : undefined;
  })].filter((b): b is LoBlock => Boolean(b?.ensureReady));
  return engines.length > 0
    ? async () => { await Promise.all(engines.map(b => b.ensureReady!())); }
    : undefined;
}

/** Run the grade function against the prepared invocation. */
export function evaluateGrade(prepared: PreparedGrade): RawGraderResult | Promise<RawGraderResult> {
  return prepared.descriptor.fn(prepared.graderProps, prepared.param);
}

/** A preparation failure as a learner-facing grading outcome — already
 *  normalized (correctness.invalid, empty score), so callers use it directly
 *  without a second normalizeGraderResult pass. */
export function preparationErrorResult(error: string): GradingResult {
  return { correct: correctness.invalid, message: error, score: undefined };
}
