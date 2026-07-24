// packages/shared/components/blocks/grading/RulesGrader/RulesGrader.ts
//
// RulesGrader - Grader that evaluates Match rules top-to-bottom.
//
// Contains Match blocks (StringMatch, NumericalMatch, DefaultMatch) as children,
// plus an input block. Evaluates rules against the input, returns first match.
//
// Usage:
//   <RulesGrader>
//     <StringMatch answer="2x" score="1" feedback="Correct!"/>
//     <StringMatch answer="x" score="0.25" feedback="Right variable, wrong coefficient"/>
//     <DefaultMatch score="0" feedback="Try again"/>
//     <LineInput/>
//   </RulesGrader>
//
import { z } from 'zod';
import { core, grader, isMatch, getBlockByOLXId } from '@/lib/blocks';
import { qualifyDefinitionRef } from '@/lib/types/id-grammar';
import { correctness } from '@/lib/grading/correctness';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import type { JSONValue, OlxJson, RuntimeProps } from '@/lib/types';
import { isKidArray } from '@/lib/types/kids';

/**
 * Grade by evaluating child Match rules top-to-bottom, returning first match.
 *
 * @param {Object} props - RulesGrader props including kids
 * @param {Object} context - { input, inputs, inputApi, inputApis }
 * @returns {{ correct: correctness, message: string, score?: number }}
 */
function gradeRules(props: RuntimeProps, context) {
  const blockRegistry = props.runtime.blockRegistry;

  // Check for empty input → unsubmitted
  // The grader() action factory doesn't handle this automatically (unlike
  // graderFromMatch), so we check here before iterating match rules.
  const { input } = context;
  if (input === undefined || input === null ||
      (typeof input === 'string' && input.trim() === '')) {
    return { correct: correctness.unsubmitted, message: '', score: 0 };
  }

  // Evaluate child Match rules in order, discovered from the STATIC DOM's
  // kids structure — this grade function runs wherever grading runs
  // (selectors, node, analytics), where there is no dynamic (rendered) DOM.
  //
  // The walk is WRAPPER-TRANSPARENT (same doctrine as when=-hidden graders
  // still counting, and as choiceHelpers.choiceKeysFromKids descending through
  // non-choice blocks): Match rules may sit inside inline (html) wrappers
  // (<div><StringMatch/></div>) OR inside block wrappers (a <Vertical> laying
  // the rules out), so descend through BOTH to reach them. The ONE boundary is
  // a nested GRADER: its Match children are ITS rules, not ours (grader-ness
  // read off the blueprint, the way lib/grading/topology.ts does), so we stop
  // at it. A matched Match block is itself terminal — no descent past a rule.
  const matchEntries: OlxJson[] = [];
  const collectMatches = (kids: JSONValue): void => {
    if (!isKidArray(kids)) return;
    for (const kid of kids) {
      if (kid.type === 'html') {
        collectMatches(kid.kids);
      } else if (kid.type === 'block') {
        const entry = getBlockByOLXId(props, qualifyDefinitionRef(kid.id, props.runtime.ns));
        if (!entry) continue;
        const blueprint = blockRegistry[entry.tag];
        if (isMatch(blueprint)) { matchEntries.push(entry); continue; }
        // Non-match block: a nested grader owns its own rules — stop; any
        // other block is a transparent wrapper — descend into its kids.
        if (blueprint?.isGrader) continue;
        collectMatches(entry.kids ?? []);
      }
    }
  };
  collectMatches(props.kids);
  for (const childEntry of matchEntries) {
    const childBlueprint = blockRegistry[childEntry.tag];

    // Attributes are already parsed/transformed at parse time by parseOLX
    const attrs = childEntry.attributes || {};

    // Math match blocks (NumericalMatch, FormulaMatch) declare lazy
    // engines; readiness is PREPARATION, not evaluation — prepareGrade
    // readies the grader's whole static subtree (and useBlocksReady gates
    // rendered content), so this grade function stays synchronous and
    // immediate-capable.

    // Call the match function
    const matchFn = childBlueprint.locals!.match;
    const matchProps = { ...props, ...attrs };
    const result = matchFn(matchProps, context);

    // Check if this rule matched (correct === CORRECT or true)
    const matched = result.correct === correctness.correct || result.correct === true;

    if (matched) {
      // Use score/feedback from attributes
      const score = attrs.score !== undefined ? Number(attrs.score) : 1;
      const feedback = attrs.feedback || result.message || '';

      return {
        correct: score >= 1 ? correctness.correct :
                 score > 0 ? correctness.partiallyCorrect : correctness.incorrect,
        message: feedback,
        score,
        feedbackBlock: attrs.feedbackBlock,
      };
    }
  }

  // No rule matched - return incorrect with no feedback
  return {
    correct: correctness.incorrect,
    message: '',
    score: 0,
  };
}

const RulesGrader = core({
  ...parsers.blocks.allowHTML(),
  ...grader({ grader: gradeRules }),
  name: 'RulesGrader',
  fields: state.fields(state.graderFields()),
  inputSchema: z.any(),
  description: 'Grader that evaluates Match rules top-to-bottom with partial credit and feedback',
  category: 'grading',
  // Non-conventional: reuses the shared layout Noop renderer.
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  // Display answer: find first Match child with score=1
  getDisplayAnswer: (props: RuntimeProps) => {
    if (props.displayAnswer) return props.displayAnswer;

    const { kids = [], blockRegistry } = props;
    if (!isKidArray(kids)) return undefined;
    for (const kid of kids) {
      if (kid.type !== 'block') continue;
      const childEntry = getBlockByOLXId(props, kid.id);
      if (!childEntry) continue;

      const childBlueprint = blockRegistry?.[childEntry.tag];
      if (!isMatch(childBlueprint)) continue;

      const attrs = childEntry.attributes || {};
      // Return first rule with score=1 (or no score, implying correct)
      // Attributes are now parsed, so score is a number not a string
      if (attrs.score === 1 || attrs.score === undefined) {
        return attrs.answer || attrs.displayAnswer;
      }
    }
    return undefined;
  },
});

export default RulesGrader;
