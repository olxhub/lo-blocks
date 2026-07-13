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
import { inferRelatedNodes, getDomNodeByStateKey, propsFromNode } from '../blocks/olxdom';
import { commonFields } from '../state/commonFields';
import { getBlockByOLXId } from '../blocks/getBlockByOLXId';
import { isZodCompatible, describeZodType } from '../blocks/zodCompat';
import { leafDefinitionKeyFromStateKey } from '../types/id-grammar';
import { valueSelector } from '../state/redux';
import type { FieldInfo, LoBlock, OlxDomNode, RuntimeProps, StateKey } from '../types';
import type {
  GradeError, GraderInput, GraderParams, GradingDescriptor, GradingResult, PreparedGrade, RawGraderResult,
} from './model';
import { isGradeError } from './model';

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
    message: raw.message === undefined || raw.message === null ? '' : String(raw.message),
    score: raw.score,
  };
}

/** Input blocks this grader grades: explicit target= or DOM inference. */
export function findGraderInputIds(
  props: RuntimeProps,
  node: OlxDomNode,
  infer: boolean = true,
): StateKey[] {
  return inferRelatedNodes(
    { ...props, nodeInfo: node },
    {
      selector: n => n.loBlock.isInput,
      infer,
      targets: node.olxJson.attributes.target,
    }
  );
}

/**
 * Resolve one input id to a GraderInput: live value (from the Redux
 * snapshot), bound locals API, and authoring metadata. Inputs are looked up
 * in the content idMap; the rendered DOM node supplies the input's own
 * runtime (idPrefix, logEvent context) when available.
 */
function readGraderInput(props: RuntimeProps, state: unknown, id: StateKey): GraderInput {
  const map = props.runtime.blockRegistry;
  const defKey = leafDefinitionKeyFromStateKey(id);
  const inst = getBlockByOLXId(props, defKey);
  if (!inst) {
    console.warn(`[grading] Input block "${id}" not found in idMap`);
    return { id, name: String(id), value: undefined, api: {}, commitOnChange: false };
  }
  const loBlock = map[inst.tag];
  const inputNodeInfo = getDomNodeByStateKey(props, id);
  const inputProps = {
    runtime: inputNodeInfo?.runtime ?? props.runtime,
    nodeInfo: inputNodeInfo,
    id: defKey,
    kids: inst.kids || [],
    loBlock,
    fields: loBlock.fields || {},
    locals: loBlock.locals || {},
    ...inst.attributes,
  };

  // valueSelector for uniform handling of withStatus / raw selectValue
  const { value } = valueSelector(inputProps as RuntimeProps, state, id);

  // Bound API from locals — each function gets (props, state, id) pre-bound
  const api = loBlock.locals
    ? Object.fromEntries(
      Object.entries(loBlock.locals).map(([name, fn]: [string, Function]) => [
        name,
        (...args: unknown[]) => fn(inputProps, state, id, ...args),
      ])
    )
    : {};

  return {
    id,
    name: loBlock.name || inst.tag,
    value,
    api,
    slot: inst.attributes.slot as string | undefined,
    valueSchema: loBlock.valueSchema,
    commitOnChange: Boolean(loBlock.commitOnChange),
  };
}

export function readGraderInputs(props: RuntimeProps, state: unknown, ids: StateKey[]): GraderInput[] {
  return ids.map(id => readGraderInput(props, state, id));
}

/**
 * Check input/grader type compatibility via Zod schemas (base-type
 * comparison — refinements narrow values without changing the wire type).
 */
function validateInputTypes(graderProps: RuntimeProps, inputs: GraderInput[]): GradeError | null {
  const graderInputSchema = graderProps.loBlock.inputSchema;
  if (!graderInputSchema) return null;
  for (const input of inputs) {
    if (!input.valueSchema) continue;
    if (!isZodCompatible(input.valueSchema, graderInputSchema)) {
      return {
        gradeError: `${graderProps.loBlock.name} expects ${describeZodType(graderInputSchema)} input, `
          + `but ${input.name} provides ${describeZodType(input.valueSchema)}.`,
      };
    }
  }
  return null;
}

/**
 * Map inputs to named slots: explicit slot= attributes first, then
 * positional assignment for the rest.
 */
function assignInputSlots(slots: string[], inputs: GraderInput[]):
  Record<string, GraderInput> | GradeError {
  const slotMap: Record<string, GraderInput> = {};
  const slotSet = new Set(slots);

  for (const input of inputs) {
    if (!input.slot) continue;
    if (!slotSet.has(input.slot)) {
      return { gradeError: `Unknown slot "${input.slot}" on input "${input.id}", expected: ${slots.join(', ')}` };
    }
    if (slotMap[input.slot]) {
      return { gradeError: `Duplicate slot "${input.slot}" - each slot can only be assigned once` };
    }
    slotMap[input.slot] = input;
  }

  let slotIndex = 0;
  for (const input of inputs) {
    if (input.slot) continue;
    while (slotIndex < slots.length && slotMap[slots[slotIndex]]) slotIndex++;
    if (slotIndex >= slots.length) {
      return { gradeError: `Too many inputs: grader expects ${slots.length} (${slots.join(', ')}), found more` };
    }
    slotMap[slots[slotIndex++]] = input;
  }

  for (const slot of slots) {
    if (!slotMap[slot]) return { gradeError: `Missing input for slot "${slot}"` };
  }
  return slotMap;
}

/**
 * Shape inputs into the parameter the grade function expects
 * (named slots / list / single).
 */
export function buildGraderParam(
  descriptor: Pick<GradingDescriptor, 'slots' | 'inputType'>,
  inputs: GraderInput[],
): GraderParams | GradeError {
  const { slots, inputType } = descriptor;
  if (slots && slots.length > 0) {
    const slotMap = assignInputSlots(slots, inputs);
    if (isGradeError(slotMap)) return slotMap;
    const inputDict: Record<string, unknown> = {};
    const inputApiDict: Record<string, object> = {};
    for (const [slot, input] of Object.entries(slotMap)) {
      inputDict[slot] = input.value;
      inputApiDict[slot] = input.api;
    }
    return { inputDict, inputApiDict };
  }
  if (inputType === 'list') {
    return { inputList: inputs.map(i => i.value), inputApis: inputs.map(i => i.api) };
  }
  if (inputs.length === 0) return { gradeError: 'No input found' };
  return { input: inputs[0].value, inputApi: inputs[0].api };
}

/**
 * Given a grader node and a Redux snapshot: what exactly would we grade?
 *
 * Authoring/configuration failures come back as GradeError (the caller
 * renders them as correctness.invalid); broken runtime invariants throw.
 */
export function prepareGrade(
  props: RuntimeProps,
  state: unknown,
  node: OlxDomNode,
  descriptor: GradingDescriptor,
): PreparedGrade | GradeError {
  const graderProps = { ...propsFromNode(node), ...node.olxJson.attributes };
  const inputIds = findGraderInputIds(props, node, descriptor.infer ?? true);
  const inputs = readGraderInputs(props, state, inputIds);

  const typeError = validateInputTypes(graderProps, inputs);
  if (typeError) return typeError;

  const param = buildGraderParam(descriptor, inputs);
  if (isGradeError(param)) return param;

  return {
    graderProps,
    descriptor,
    inputs,
    param,
    ensureReady: node.loBlock.ensureReady,
  };
}

/** Run the grade function against the prepared invocation. */
export function evaluateGrade(prepared: PreparedGrade): RawGraderResult | Promise<RawGraderResult> {
  return prepared.descriptor.fn(prepared.graderProps, prepared.param);
}

/** A GradeError as a learner-facing grading outcome. */
export function gradeErrorResult(error: GradeError): RawGraderResult {
  return { correct: correctness.invalid, message: error.gradeError };
}
