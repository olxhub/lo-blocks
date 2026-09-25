// packages/shared/components/blocks/action/LLMAction.ts
import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import * as reduxClient from '@/lib/llm/reduxClient';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import { verdictFor } from '@/lib/llm/derivedVerdicts';
import {
  parseSlots,
  parseCover,
  parseEquals, parseOnlyIf, parseRequires, parseDerived, parseCounts, parseForbid,
  parseMaps,
  buildSlotSchema,
  parseChoices,
  parseExpect,
  composeSlotFeedback,
  slotSheetGuidance,
  publishedSheet,
  DEFAULT_VERDICTS,
} from '@/lib/llm/slotSheet';

export const fields = state.fields([]);

// Structured checks: a declared `slots` sheet turns this call into structured
// output, so a checklist the model must complete becomes required properties of
// a strict JSON Schema instead of a request in prose. The parsing, schema and
// rendering live in lib/llm/slotSheet.ts — see that file for why.

/**
 * Verdicts read off the page instead of asked of the model.
 *
 * `derived="has_own_graph:plots:fieldA,fieldB"` asks whether those fields hold
 * data that actually plots. `verdictFor` dispatches on the rule's kind and, for
 * plotted data, answers through the chart's own parser so the grader cannot
 * disagree with what the student sees. `DerivedChecks` shares the dispatcher for
 * items with no LLM call at all.
 */
function deriveChecks(props: any, rules: import('@/lib/llm/slotSheet').DerivedRule[]) {
  const out: Record<string, { verdict: string; evidence: string }> = {};
  for (const rule of rules) {
    const texts = rule.targets.map(ref => {
      try {
        const key = stateKeyForGlobalRef(ref as any, props.runtime.ns);
        const field = state.componentFieldByStateKey(props, key, 'value');
        return String(state.getField(props, field, { stateKey: key }) ?? '');
      } catch {
        return '';                // no such field: contributes no data
      }
    });
    out[rule.key] = verdictFor(rule, texts);
  }
  return out;
}

// Main LLM action function
async function llmAction({ props }) {
  const targetRef = props.target;
  if (!targetRef) {
    console.warn('⚠️ LLMAction: No target specified in action attributes');
    return;
  }
  const targetStateKey = stateKeyForGlobalRef(targetRef, props.runtime.ns);

  // Get target component's fields dynamically
  // 'state' field is optional — TextSlot has it, TextArea doesn't
  const valueField = state.componentFieldByStateKey(props, targetStateKey, 'value');
  let stateField;
  try { stateField = state.componentFieldByStateKey(props, targetStateKey, 'state'); } catch {}

  try {
    state.setField(props, valueField, '', { stateKey: targetStateKey });
    if (stateField) state.setField(props, stateField, reduxClient.LLM_STATUS.RUNNING, { stateKey: targetStateKey });

    const promptText = blocks.extractChildText(props, props.nodeInfo.olxJson);
    if (!promptText.trim()) {
      throw new Error('LLMAction: No prompt content found');
    }

    // A declared slot sheet switches this call to structured output. If the
    // provider ignored the schema (bedrock, stub) the parse yields null and we
    // show the prose it did return, so the block degrades rather than breaking.
    const slotsAttr: string | undefined = props.slots;
    let content: string;
    if (slotsAttr?.trim()) {
      const verdictsAttr: string | undefined = props.verdicts;
      const defaults = verdictsAttr
        ? verdictsAttr.split(',').map((v: string) => v.trim()).filter(Boolean)
        : DEFAULT_VERDICTS;
      // `free` rides ON the slots, so every consumer of this sheet --
      // scoring here, and publishedSheet for whatever re-scores it later --
      // carries the forgiven verdicts without another parameter.
      // `charge` and `because` ride on the slots for the same reason `free`
      // does: every consumer of this sheet -- scoring here, and publishedSheet
      // for whatever re-scores it later -- then carries the DEDUCTION CODE
      // without another parameter. Until this, the rubric declared the code and
      // only the paper scorer could see it.
      const slots = parseSlots(slotsAttr, defaults, props.free,
                               props.charge, props.because);
      const equals = parseEquals(props.equals);
      const onlyif = parseOnlyIf(props.onlyif);
      const derived = parseDerived(props.derived);
      const counts = parseCounts(props.counts);
      const cover = parseCover(props.cover);
      const choices = parseChoices(props.choices);
      const expect = parseExpect(props.expect);
      const requires = parseRequires(props.requires);
      const forbid = parseForbid(props.forbid);
      const maps = parseMaps(props.maps);
      if (slots.length === 0) {
        throw new Error(`LLMAction: could not parse any slots from slots="${slotsAttr}"`);
      }
      const showChecks = String(props.showChecks ?? 'true') !== 'false';
      // A shown checklist changes the SHAPE of good feedback: the student reads
      // each comment beside the check it is about, so the model is asked for one
      // note per check rather than a paragraph. Both halves are automatic — the
      // schema makes the notes exist, the guidance says what they are for — so an
      // author gets this by setting showChecks, not by writing it into a prompt.
      const { data, text } = await reduxClient.callLLMJson(
        promptText + slotSheetGuidance(showChecks),
        buildSlotSchema(slots, equals, derived, counts, showChecks, cover, choices, expect,
                        forbid, maps),
        'feedback_checks',
        props.runtime.activityId,
      );
      // Merged before anything reads `checks`, so feedback, the published sheet
      // and the grader all see one set of verdicts with no notion of origin.
      if (data && derived.length) {
        data.checks = { ...(data.checks ?? {}), ...deriveChecks(props, derived) };
      }
      content = data ? composeSlotFeedback(slots, data, { showChecks, cover, equals, onlyif, counts, expect, requires, forbid, maps }) : text;
      // Publish the sheet and its verdicts for anything that needs to reason
      // about them rather than read them — a grader, or an analysis harness.
      // Written whether or not the checklist is displayed.
      if (data) {
        try {
          const checksField = state.componentFieldByStateKey(props, targetStateKey, 'checks');
          state.setField(props, checksField, JSON.stringify(publishedSheet({
            slots, verdicts: (data.checks ?? {}) as Record<string, unknown>, showChecks,
            choices, expect,
            max: props.max, cover, equals, onlyif, counts, requires, forbid, maps,
          })), { stateKey: targetStateKey });
        } catch {
          // Target has no `checks` field (e.g. a plain TextSlot) — the prose
          // still lands, which is all a display-only target needs.
        }
      }
    } else {
      content = await reduxClient.callLLMSimple(promptText, props.runtime.activityId);
    }
    state.setField(props, valueField, content, { stateKey: targetStateKey });
    if (stateField) state.setField(props, stateField, reduxClient.LLM_STATUS.RESPONSE_READY, { stateKey: targetStateKey });

  } catch (error) {
    console.error('LLM generation failed:', error);
    state.setField(props, valueField, `Error: ${error.message}`, { stateKey: targetStateKey });
    if (stateField) state.setField(props, stateField, reduxClient.LLM_STATUS.ERROR, { stateKey: targetStateKey });
  }
}

// Custom parser that handles mixed text and block content
const llmActionParser = async function({ id, rawParsed, tag, attributes, source, parseDeps, provider, parseNode, storeEntry }) {
  const kids: any[] = [];

  // Process each child node in the raw parsed XML
  const childNodes = Array.isArray(rawParsed[tag]) ? rawParsed[tag] : [];

  for (const child of childNodes) {
    if (child['#text']) {
      // Text content - add as string
      kids.push(child['#text']);
    } else {
      // Block content - parse as normal
      const childTag = Object.keys(child).find(k => !['#text', '#comment', ':@'].includes(k));
      if (childTag) {
        const parsedChild = await parseNode(child);
        if (parsedChild) {
          kids.push(parsedChild);
        }
      }
    }
  }

  storeEntry(id, {
    id,
    tag,
    attributes,
    kids,
    source,
    parseDeps
  });
};

const LLMAction = blocks.test({
  parser: llmActionParser,
  staticKids: parsers.directKidIds,
  ...blocks.action({
    action: llmAction,
  }),
  name: 'LLMAction',
  description: 'Executes LLM prompts with embedded Element references and updates target components',
  // Shared hidden renderer lives in layout/, not a sibling of this file.
  componentLoader: () => import('@/components/blocks/layout/_Hidden').then(m => m.default),
  fields,
  attributes: z.object({
    target: z_stateRef.describe('ID of the TextSlot or LLMFeedback to write output to'),
    slots: z.string().optional().describe(
      'Optional checklist the model must complete, as `key:Label` entries separated by "|". ' +
      'Adding this switches the call to structured output: each slot becomes a required ' +
      'property of a strict JSON Schema, so the model cannot skip one. Append ' +
      '`:opt1/opt2` to an entry to override the verdict set for that slot.'
    ),
    verdicts: z.string().optional().describe(
      'Comma-separated verdict values available to every slot (default "met,absent,unclear"). ' +
      'The FIRST value is the satisfied one and is what the rendered checklist ticks.'
    ),
    max: z.coerce.number().optional().describe(
      "The item's total, when the sheet is graded. Supply it whenever the checks' " +
      'costs do not sum to the total — a rubric whose deductions can exceed the ' +
      'item applies them and clamps. Omit it for an additive item, where the ' +
      'costs already sum to the total.'
    ),
    cover: z.string().optional().describe(
      'Checks that between them must COVER a set of labels, so the grader does the ' +
      'pairing instead of the prompt. Groups separated by "|", each ' +
      '`key,key:label,label` — e.g. "state_a1,state_a2:first,second". A check is ' +
      'satisfied when it names one of the labels and no earlier check in its group ' +
      'has claimed that label, which makes the correspondence order-independent ' +
      'and double-naming unrepresentable.'
    ),
    equals: z.string().optional().describe(
      'Checks the grader COMPUTES by comparing two others instead of asking. Rules ' +
      'separated by "|", each `key:left,right` — e.g. ' +
      '"matches_chosen_type:observed_type,named_type". The check is satisfied when ' +
      'both operands were answered and agree. A computed check is left out of the ' +
      'response schema, so the model is never asked for an answer that would be ' +
      'discarded.'
    ),
    counts: z.string().optional().describe(
      'A repeated element counted ONCE, with its member checks derived from the ' +
      'count. Groups separated by "|", each `key:member,member` — e.g. ' +
      '"reasons_given:reason_1,reason_2,reason_3". The model answers how many it ' +
      'found and the first N members are awarded; the members leave the response ' +
      'schema. Use where the rubric awards a point per instance and says to count ' +
      'generously, since "how many are there" is a steadier judgement than "is ' +
      'there a third one".'
    ),
    derived: z.string().optional().describe(
      'Checks whose verdict is read off the PAGE rather than asked of the model. ' +
      'Rules separated by "|", each `key:ref,ref` — e.g. ' +
      '"has_own_graph:bmod_h3_baseline,bmod_h3_wk1". Satisfied when those fields ' +
      'hold data that actually plots, decided by the same parser the chart draws ' +
      'with. Left out of the response schema, so the model is never asked to ' +
      'guess at something the runtime already knows.'
    ),
    choices: z.string().optional().describe(
      'Named sets of categories an item asks about, "name:a,b,c" separated by "|". ' +
      'Referenced by a slot\'s pick(name); declared once instead of restated per slot.'),
    expect: z.string().optional().describe(
      'A check COMPUTED by comparing one classification against an authored value: ' +
      '"key:pickSlot=VALUE:lenient,…". The counterpart to equals, which compares two ' +
      'classifications. Names the expected answer out loud instead of by list order.'),
    onlyif: z.string().optional().describe(
      'Checks that are only CHARGED when another check is satisfied, for rubrics ' +
      'that bill one deduction for either of two causes and never twice. Rules ' +
      'separated by "|", each `key:condition` — e.g. ' +
      '"matches_request:observed_kind". The check is still answered and ' +
      'reported honestly; only its cost is suppressed, so the model is never asked ' +
      'to report a verdict that is false in order to make the arithmetic come out.'
    ),
    requires: z.string().optional().describe(
      'Checks that are only CREDITED while another check holds. The mirror of ' +
      'onlyif, which suppresses a charge: this denies credit. Rules separated by ' +
      '"|", each `key:condition` — e.g. "state_c2:link_c2". For a rubric whose ' +
      'slots come in pairs, where a fact established by one check decides whether ' +
      'the pair scored on OTHER checks was ever addressed at all.'
    ),
    charge: z.string().optional().describe(
      'The DEDUCTION CODE each slot charges when it is not satisfied, as ' +
      '"slot:CODE|slot:CODE" — e.g. "is_oc:NOT_OC". Without it this runtime ' +
      'can say a slot failed and what it cost, but not WHICH RULE it broke, ' +
      'so the score and the paper ledger were two different objects computed ' +
      'from one rubric. A slot with points and no code still costs its points ' +
      'and reports no deduction: silence means the rubric named none, never ' +
      'that nothing was charged.'
    ),
    because: z.string().optional().describe(
      'The wording that explains a charge, as "slot:text|slot:text". Paired ' +
      'with `charge`; carried so feedback can say why rather than only what.'
    ),
    free: z.string().optional().describe(
      'Verdicts that are NOT satisfying and still cost NOTHING, as ' +
      '"slot:verdict,verdict|slot:verdict" — e.g. "claim_stated:unclear". This ' +
      'runtime fails anything that is not the satisfying verdict; the paper ' +
      'scorer charges only what a deduction code names. Those are opposite ' +
      'defaults and they agreed only while the two enumerations happened to be ' +
      'complements, so a verdict neither side names is scored by one and ' +
      'forgiven by the other. Declared here, never inferred from a missing ' +
      'code: a code keyed on a counterpart name reads as missing and would ' +
      'forgive a real failure. The verdicts ride ON the slots, so a published ' +
      'sheet re-scores by the rules in force when it was written.'
    ),
    rubricDef: z.string().optional().describe(
      'The rubric definition this sheet is generated FROM, as an element id — ' +
      'e.g. "q4b". Its slots, verdicts and codes are one ' +
      'projection of that definition; naming it lets a second consumer ' +
      'derive its own projection from the same source instead of restating ' +
      'it, so the two cannot drift. Named `rubricDef` and not `rubric` ' +
      'because `rubric` is already an attribute of LLMGrader, where it ' +
      'carries grading PROSE read by the model — the opposite kind of ' +
      'value. Accepted and IGNORED until content sets it: the attribute ' +
      'exists a full stage before anything relies on it, because the engine ' +
      'and the content version separately and no step can land in both at ' +
      'once.'
    ),
    forbid: z.string().optional().describe(
      'A check that FAILS on a named COMBINATION of other answers, for a code the ' +
      'rubric charges only when several things are true at once. Rules separated ' +
      'by "|", each `key:slot=value,slot=value` — e.g. ' +
      '"no_examples:example_1=absent,example_2=absent". Each operand stays ' +
      'its own question, so the model is never asked to report the combination; the ' +
      'check is computed and left out of the response schema. Append `~verdict` to ' +
      'the key to name the failing verdict.'
    ),
    maps: z.string().optional().describe(
      "A check COMPUTED by mapping one pick's value to a NAMED verdict, so a check " +
      'with more than one kind of failure can be derived rather than asked. Rules ' +
      'separated by "|", each `key:pick:value~verdict,…` with `*` as the fallback — ' +
      'e.g. "item_1:i1_basis:direct~met,none~absent,*~wrong_kind". `~` and not ' +
      '">" because an opening tag is read as `[^>]*>`, and a ">" inside an attribute ' +
      'truncates the match.'
    ),
    showChecks: z.enum(['true', 'false']).optional().describe(
      'Whether to show the student the filled checklist under the feedback (default true). ' +
      'Set "false" on items graded deliberately generously, where a tick list reads as a ' +
      'scorecard: the model must still complete the sheet, so the checks are still forced ' +
      'and still measurable, but only the prose is displayed.'
    ),
  }).strict(),
});

export default LLMAction;
