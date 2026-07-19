// packages/shared/components/blocks/language-arts/TextSelection/TextSelectionInput.ts
//
// Input half of the TextSelection family. Owns the passage grammar, the
// selection UI, and the stored selection. The matching grader is
// TextSelectionGrader; a bare <TextSelection> tag generates the pair.
//
// The value is the selection itself — an array of selected word indices — so
// no composite value getter is needed (the field IS the value). The passage's
// answer key lives in the markup, projected for the grader by the
// `getExpectedSelections` local (the getChoices pattern: static, callable from
// graders and analytics with no rendered DOM).
//
import { z } from 'zod';
import { test, input, src } from '@/lib/blocks';
import * as state from '@/lib/state';
import { decodedFieldSelector } from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import * as parser from './_textSelectionParser';
import { expectedSelections, type ParsedDocument } from './textSelectionModel';
import type { RuntimeProps } from '@/lib/types';

// `selections` (not `value`) keeps the field name stable across the split so
// learner state authored against the old single-block TextSelection carries.
export const fields = state.fields(['selections']);

// Getters run inside useSelector subscriptions; a fresh [] per call would
// defeat the equality gate and re-render every dispatch while unanswered.
const EMPTY_SELECTIONS: number[] = [];

/** The parsed passage from this input's kids (peggyParser stores it as .parsed). */
function parsedOf(props: RuntimeProps): ParsedDocument {
  return (props.kids as { parsed?: ParsedDocument })?.parsed ?? {
    prompt: '', segments: [], scoring: [], targetedFeedback: {},
  };
}

const TextSelectionInput = test({
  ...peggyParser(parser),
  ...input({ valueSchema: z.array(z.number()) }),
  name: 'TextSelectionInput',
  category: 'language-arts',
  description: 'Interactive passage where the learner selects words or phrases marked in the source markup. Value is an array of selected word indices.',
  // Selecting a span is a deliberate answer (like a radio click), so immediate
  // grading treats it as committed rather than softening to incomplete.
  commitOnChange: true,
  fields,
  selectors: {
    // value === the stored selection; the field is the value (level 3 == level 2).
    value: (state, props: RuntimeProps, _stateKey) =>
      decodedFieldSelector(state, props, fields.selections, { fallback: EMPTY_SELECTIONS }),
  },
  attributes: z.object({ ...src }).strict(),  // Optional external passage file.
  locals: {
    // Projects the answer key off the parsed passage for the grader. Bound at
    // grade time to this input's own (props, state, id); ignores state/id —
    // the projection is pure over the parse.
    getExpectedSelections: (props: RuntimeProps) => expectedSelections(parsedOf(props)),
  },
});

export default TextSelectionInput;
