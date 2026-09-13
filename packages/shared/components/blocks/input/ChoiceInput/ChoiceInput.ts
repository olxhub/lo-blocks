// packages/shared/components/blocks/input/ChoiceInput/ChoiceInput.ts
//
// Single-select (radio button) input. Value is stored as a string.
// For multi-select (checkboxes), use CheckboxInput instead.
//
import { z } from 'zod';
import { core, input, z_stateRefList } from '@/lib/blocks';
import * as state from '@/lib/state';
import { decodedFieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { z_olx_boolean } from '@/lib/blocks/attributeSchemas';
import { getChoices } from './choiceHelpers';
import { warnOnOptionCodeTypos } from './defaultCodes';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

// The kids parser, wrapped below so each option's code= can be checked
// against this item's own reverseCoded= BEFORE the options are parsed. An
// option's validateAttributes sees only its own attributes, and whether a
// code is a typo or a reversal is the item's question, not the option's.
const kidsParser = parsers.blocks();

const ChoiceInput = core({
  ...kidsParser,
  parser: async (ctx: any) => {
    warnOnOptionCodeTypos(ctx);
    return kidsParser.parser(ctx);
  },
  name: 'ChoiceInput',
  ...input({ valueSchema: z.string() }),
  // Clicking a radio is a deliberate answer — immediate-mode grading shows
  // incorrect right away instead of softening to incomplete.
  commitOnChange: true,
  description: 'Single-select (radio button) input collecting student selection from Key/Distractor options. Value is a string.',
  // Renders its kids inside a ChoiceGroupContext so each Key/Distractor learns
  // its parent input directly (see _ChoiceGroup) rather than discovering it.
  componentLoader: () => import('./_ChoiceGroup').then(m => m.default),
  fields,
  selectors: {
    value: (state, props: RuntimeProps, _stateKey) => decodedFieldSelector(state, props, fields.value, { fallback: '' }),
    // The selected option's numeric CODE — the survey-methodology sense
    // (SPSS code, Qualtrics recode value), never a score or a grade. Read as
    // `@inputId.code`. Undefined when nothing is selected, and undefined when
    // the selected option carries no code and its value is not in the default
    // table (defaultCodes.ts) — an honest gap beats a guessed number.
    //
    // Pure over Redux state plus parsed content: the value comes from the
    // store, the options from getChoices (the static kids/target walk that
    // graders already use), and nothing is read from the rendered DOM. It
    // reads the value field exactly as `value` above does, so the two can
    // never disagree about which option is selected.
    code: (state, props: RuntimeProps, _stateKey) => {
      const selected = decodedFieldSelector(state, props, fields.value, { fallback: '' });
      if (!selected) return undefined;
      return getChoices(props, state, undefined)
        .find(choice => choice.value === selected)?.code;
    },
  },
  attributes: z.object({
    target: z_stateRefList.optional().describe('Comma-separated IDs of Key/Distractor children if not directly nested'),
    reverseCoded: z_olx_boolean.default(false).describe(
      'Mark this item REVERSE-CODED (the psychometric sense: agreeing with it means the opposite of agreeing with the rest of the scale). The default-code table is negated for this item\'s options — agree → -1, strongly_disagree → 2 — so a reversed Likert item needs no per-option code= at all. An explicit code= still wins, and is checked against the negated default. Recording only; never a score or a grade.'),
  }).strict(),
  locals: {
    getChoices
  }
});

export default ChoiceInput;
