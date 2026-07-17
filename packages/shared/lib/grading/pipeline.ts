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
import { commonFields } from '../state/commonFields';
import { valueSelector } from '../state/redux';
import { leafDefinitionKeyFromStateKey } from '../types/id-grammar';
import { graderInputStateKeys } from './topology';
import { staticEntry, staticEntryForStateKey, blueprintFor, inferKids } from '../blocks/staticDom';
import type { FieldInfo, LoBlock, OlxJson, RuntimeProps, StateKey } from '../types';
import type {
  GradePreparation, GraderInput, GraderParams, GradingDescriptor, GradingResult,
  PreparedGrade, RawGraderResult,
} from './model';

// ---------------------------------------------------------------------------
// The grading-field contract — shared by writes (submitGrade.ts) and reads
// (selectGradingState.ts), so both sides resolve block-specific field
// overrides the same way.
// ---------------------------------------------------------------------------

export type GradingFieldName = 'correct' | 'message' | 'score' | 'submitCount' | 'lastSubmission';

export function gradingField(loBlock: LoBlock | undefined, name: GradingFieldName): FieldInfo {
  return (loBlock?.fields?.[name] as FieldInfo) ?? (commonFields as Record<string, FieldInfo>)[name];
}

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

/** Build a block's props from its static-DOM entry (no dynamic DOM). */
export function staticProps(props: RuntimeProps, defKey: string, entry: OlxJson, loBlock: LoBlock): RuntimeProps {
  return {
    runtime: props.runtime,
    nodeInfo: undefined,
    id: defKey,
    kids: entry.kids || [],
    loBlock,
    fields: loBlock.fields || {},
    locals: loBlock.locals || {},
    ...entry.attributes,
  } as unknown as RuntimeProps;
}

/**
 * Resolve one input to a GraderInput: live value (from the Redux snapshot),
 * bound locals API, and authoring metadata — all from the static DOM plus
 * the block registry.
 */
function readGraderInput(props: RuntimeProps, state: unknown, stateKey: StateKey): GraderInput {
  const defKey = leafDefinitionKeyFromStateKey(stateKey);
  const olxJson = staticEntryForStateKey(state, props, stateKey);
  if (!olxJson) {
    // Content still loading (ensureBlock in flight) — a transient, not an
    // answer. The caller surfaces it as a preparation error.
    throw new InputContentPending(stateKey);
  }
  const loBlock = props.runtime.blockRegistry[olxJson.tag];
  const inputProps = staticProps(props, defKey, olxJson, loBlock);

  // valueSelector for uniform handling of withStatus / raw selectValue
  const { value } = valueSelector(inputProps, state, stateKey);

  // Bound API from locals — each function gets (props, state, id) pre-bound
  const api = loBlock.locals
    ? Object.fromEntries(
      Object.entries(loBlock.locals).map(([name, fn]: [string, Function]) => [
        name,
        (...args: unknown[]) => fn(inputProps, state, stateKey, ...args),
      ])
    )
    : {};

  return {
    stateKey,
    name: loBlock.name || olxJson.tag,
    value,
    api,
    slot: olxJson.attributes.slot as string | undefined,
    valueSchema: loBlock.valueSchema,
    commitOnChange: Boolean(loBlock.commitOnChange),
  };
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
function assignInputSlots(slots: string[], inputs: GraderInput[]):
  { slotMap?: Record<string, GraderInput>; error?: string } {
  const slotMap: Record<string, GraderInput> = {};
  const slotSet = new Set(slots);

  for (const input of inputs) {
    if (!input.slot) continue;
    if (!slotSet.has(input.slot)) {
      return { error: `Unknown slot "${input.slot}" on input "${input.stateKey}", expected: ${slots.join(', ')}` };
    }
    if (slotMap[input.slot]) {
      return { error: `Duplicate slot "${input.slot}" - each slot can only be assigned once` };
    }
    slotMap[input.slot] = input;
  }

  let slotIndex = 0;
  for (const input of inputs) {
    if (input.slot) continue;
    while (slotIndex < slots.length && slotMap[slots[slotIndex]]) slotIndex++;
    if (slotIndex >= slots.length) {
      return { error: `Too many inputs: grader expects ${slots.length} (${slots.join(', ')}), found more` };
    }
    slotMap[slots[slotIndex++]] = input;
  }

  for (const slot of slots) {
    if (!slotMap[slot]) return { error: `Missing input for slot "${slot}"` };
  }
  return { slotMap };
}

/**
 * Shape inputs into the parameter the grade function expects
 * (named slots / list / single).
 */
export function buildGraderParam(
  descriptor: Pick<GradingDescriptor, 'slots' | 'inputType'>,
  inputs: GraderInput[],
): { param?: GraderParams; error?: string } {
  const { slots, inputType } = descriptor;
  if (slots && slots.length > 0) {
    const { slotMap, error } = assignInputSlots(slots, inputs);
    if (error || !slotMap) return { error };
    const inputDict: Record<string, unknown> = {};
    const inputApiDict: Record<string, object> = {};
    for (const [slot, input] of Object.entries(slotMap)) {
      inputDict[slot] = input.value;
      inputApiDict[slot] = input.api;
    }
    return { param: { inputDict, inputApiDict } };
  }
  if (inputType === 'list') {
    return { param: { inputList: inputs.map(i => i.value), inputApis: inputs.map(i => i.api) } };
  }
  if (inputs.length === 0) return { error: 'No input found' };
  return { param: { input: inputs[0].value, inputApi: inputs[0].api } };
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
  const entry = staticEntryForStateKey(state, props, graderKey);
  if (!entry) return { ok: false, inputs: [], error: 'Grader content is not loaded' };
  const loBlock = blueprintFor(props, entry)!;
  const graderProps = staticProps(props, leafDefinitionKeyFromStateKey(graderKey), entry, loBlock);

  let inputs: GraderInput[];
  try {
    inputs = readGraderInputs(props, state, graderInputStateKeys(state, props, graderKey));
  } catch (e) {
    if (e instanceof InputContentPending) {
      return { ok: false, inputs: [], error: `Input "${e.stateKey}" is still loading` };
    }
    throw e;
  }

  const typeError = validateInputTypes(graderProps, inputs);
  if (typeError) return { ok: false, inputs, error: typeError };

  const { param, error } = buildGraderParam(descriptor, inputs);
  if (error || !param) return { ok: false, inputs, error: error ?? 'Could not build grader parameters' };

  // Readiness covers the grader's whole static subtree, not just its own
  // blueprint: RulesGrader's Match children (NumericalMatch, FormulaMatch)
  // declare lazy engines, and readying them HERE is what lets grade
  // functions stay synchronous — evaluation never awaits. (The render
  // gate, useBlocksReady, readies rendered blocks; this covers headless
  // callers: submit actions, analytics, server.)
  const engineDefKeys = inferKids(state, props, entry.kids, {
    selector: b => Boolean(b.ensureReady),
  });
  const engines = [loBlock, ...engineDefKeys.map(k => {
    const kidEntry = staticEntry(state, props, k);
    return kidEntry ? blueprintFor(props, kidEntry) : undefined;
  })].filter((b): b is LoBlock => Boolean(b?.ensureReady));
  const ensureReady = engines.length > 0
    ? async () => { await Promise.all(engines.map(b => b.ensureReady!())); }
    : undefined;

  return {
    ok: true,
    inputs,
    prepared: {
      graderProps,
      descriptor,
      inputs,
      param,
      ensureReady,
    },
  };
}

/** Run the grade function against the prepared invocation. */
export function evaluateGrade(prepared: PreparedGrade): RawGraderResult | Promise<RawGraderResult> {
  return prepared.descriptor.fn(prepared.graderProps, prepared.param);
}

/** A preparation failure as a learner-facing grading outcome. */
export function preparationErrorResult(error: string): RawGraderResult {
  return { correct: correctness.invalid, message: error };
}
