// Dispatch for checks whose verdict is read off the page.
//
// NOT a leaf, unlike slotSheet.ts: it reaches into the chart's parser so that a
// verdict about plotted data is decided by the same code that plots it. Both
// callers — LLMAction, for items that mix derived checks with judgements, and
// DerivedChecks, for items with no model call at all — come through here so the
// dispatch exists once.

import type { DerivedRule } from './slotSheet';
import { completeVerdict, dataVerdict }
  from '@/components/blocks/display/SelfMonitorPlot/dataVerdict';

export type DerivedVerdict = { verdict: string; evidence: string };

/**
 * Is a value present at all?
 *
 * For a closed choice there is nothing to parse and nothing to be wrong: the
 * rubric's other failure — naming something that is not one of the offered
 * options — cannot happen when the options are the only thing selectable. So the
 * only question left is whether they answered.
 */
function presentVerdict(texts: string[]): DerivedVerdict {
  const filled = texts.filter(t => String(t ?? '').trim()).length;
  return filled === texts.length
    ? { verdict: 'met', evidence: 'Answered.' }
    : { verdict: 'absent', evidence: 'Nothing chosen here.' };
}

export function verdictFor(rule: DerivedRule, texts: string[]): DerivedVerdict {
  switch (rule.kind) {
    case 'plots':
      return dataVerdict(texts, rule.template);
    case 'complete':
      return completeVerdict(texts, rule.template);
    case 'present':
      return presentVerdict(texts);
    default:
      // parseDerived filters unknown kinds, so this is unreachable from authored
      // content; it exists so a new kind cannot be added to DERIVED_KINDS without
      // being handled here.
      throw new Error(`derived: unhandled kind "${rule.kind}" for \`${rule.key}\``);
  }
}
