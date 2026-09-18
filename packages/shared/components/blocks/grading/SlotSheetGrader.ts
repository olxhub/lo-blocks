// packages/shared/components/blocks/grading/SlotSheetGrader.ts
//
// Scores a verdict sheet produced by an LLMAction.
//
// An LLMAction with a `slots` attribute makes the model complete a checklist
// before it writes anything, and publishes the filled checklist to its target's
// `checks` field. This grader turns that into a score: the sheet's total, minus
// what each unsatisfied check costs.
//
//   <LLMFeedback id="q_feedback" />
//   <ActionButton label="Check my answer">
//     <LLMAction target="q_feedback"
//                slots="claim:States a claim@2|evidence:Cites evidence@1" />
//   </ActionButton>
//   <SlotSheetGrader target="q_feedback" />
//
// Points live on the sheet, next to the check they belong to, because that is
// where an author reasons about them. A sheet with no `@n` values is not
// gradeable and the grader says so rather than inventing a total.
//
// Two things this deliberately does not do. It does not display the score — the
// student sees the LLMAction's prose, and whether a score is shown at all is a
// question for the surrounding activity, not for this block. And it does not
// re-judge the response: the verdicts are the model's, and the arithmetic over
// them is all that happens here, which keeps every point traceable to a named
// check rather than to an opinion about the whole answer.

import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { correctness } from '@/lib/grading/correctness';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';
import * as state from '@/lib/state';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import type { CheckPayload, ExpectRule } from '@/lib/llm/slotSheet';
import { scoreSlotSheet, type SlotSpec, type CoverGroup, type EqualsRule,
         type OnlyIfRule, type RequiresRule, type ForbidRule,
         type CountGroup, type MapsRule } from '@/lib/llm/slotSheet';

// `showChecks` records whether the student was shown these checks. The grader
// does not read it — a hidden check still costs its points, which is the whole
// reason an author hides one — but it belongs to the sheet's shape, and an
// analysis harness reading the same field needs it.
type Payload = { slots: SlotSpec[]; verdicts: Record<string, CheckPayload>; max?: number;
                 cover?: CoverGroup[]; equals?: EqualsRule[]; onlyif?: OnlyIfRule[]; counts?: CountGroup[];
                 expect?: ExpectRule[]; requires?: RequiresRule[];
                 forbid?: ForbidRule[]; maps?: MapsRule[]; showChecks?: boolean };

/**
 * A stored sheet, as the grader needs it: parsed, with every rule defaulted.
 *
 * Spreads `parsed` FIRST so a rule the sheet carries survives even if it is not
 * named below. The previous version listed the fields by hand, and when `expect`
 * was added it was declared on the Payload type and passed to scoreSlotSheet but
 * never copied out of the JSON — so the grader silently stopped applying it and
 * every ungated cell of four items lost exactly the points that rule carried.
 * It typechecked, and it read as the model failing a check it was never asked.
 */
export function sheetFromJson(raw: unknown): Payload | null {
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || !Array.isArray(parsed.slots)) return null;
    return {
      ...parsed,
      slots: parsed.slots,
      verdicts: parsed.verdicts ?? {},
      cover: parsed.cover ?? [],
      equals: parsed.equals ?? [],
      onlyif: parsed.onlyif ?? [],
      counts: parsed.counts ?? [],
      expect: parsed.expect ?? [],
      forbid: parsed.forbid ?? [],
      // Defaulted here like the rest. The spread above would carry it, but
      // `expect` was carried that way once, went missing, and cost four items
      // their points silently -- so every rule the grader applies is named.
      maps: parsed.maps ?? [],
    };
  } catch {
    return null;
  }
}

/** Read the published sheet off the target's `checks` field. */
function readChecks(props: any): Payload | null {
  const ref = props?.target;
  if (!ref) return null;
  try {
    const key = stateKeyForGlobalRef(
      Array.isArray(ref) ? ref[0] : ref,
      props.runtime.ns,
    );
    const field = state.componentFieldByStateKey(props, key, 'checks');
    const raw = state.getField(props, field, { stateKey: key });
    if (!raw) return null;
    return sheetFromJson(raw);
  } catch {
    return null;
  }
}

function gradeSlotSheet(props: any) {
  const payload = readChecks(props);

  // Nothing published yet: the student has not pressed the button, so there is
  // no sheet to score. Not an error.
  if (!payload) {
    return { correct: correctness.unsubmitted, message: '' };
  }

  // `maps` IS THE ELEVENTH ARGUMENT AND WAS NOT PASSED, so the scorer defaulted
  // it to `[]` and no mapped check was ever computed here: the score followed
  // whatever verdict the model happened to answer for it, while `satisfiedMap`
  // stood ready to compute one. That is why a mapped slot could be recorded
  // disagreeing with its own map, and why removing the ask (b6d3f070) scored
  // every cell flat -- the key then had no verdict from either source.
  const result = scoreSlotSheet(payload.slots, payload.verdicts, payload.max, payload.cover,
                              payload.equals, payload.onlyif,
                              payload.counts, payload.expect, payload.requires,
                              payload.forbid, payload.maps);
  if (!result) {
    return {
      correct: correctness.invalid,
      message:
        'This checklist carries no point values, so there is nothing to score. ' +
        'Add @n to the checks that should count, e.g. slots="claim:States a claim@2".',
    };
  }

  const { score, max, failed } = result;
  return {
    // A fraction, as the grading layer expects.
    score: max > 0 ? score / max : 0,
    correct: failed.length === 0 ? correctness.correct : correctness.incorrect,
    message: '',
    // Kept for review: which named checks the points came off, so a score is
    // always traceable to the checks that produced it.
    details: { score, max, failed },
  };
}

const SlotSheetGrader = createGrader({
  base: 'SlotSheet',
  description: "Scores an LLMAction's verdict sheet by its checks' point values",
  grader: gradeSlotSheet,
  inputSchema: z.any(),
  inputType: 'list',
  // The target is an LLMFeedback holding a published sheet, not a student
  // input, so there is nothing to infer from children.
  infer: false,
  createMatch: false,
  allowOverrides: ['target'],
  attributes: {
    target: z_stateRef.describe(
      'ID of the LLMFeedback whose published verdict sheet should be scored',
    ),
  },
  getDisplayAnswer: () => undefined,
});

export default SlotSheetGrader;
