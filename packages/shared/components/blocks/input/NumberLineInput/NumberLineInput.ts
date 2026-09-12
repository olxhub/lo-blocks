// packages/shared/components/blocks/input/NumberLineInput/NumberLineInput.ts
//
// One position on a horizontal number line.
//
// The stored value is ALWAYS a number (`valueSchema: z.number()`), so the
// block is a drop-in for any grader that takes a number, for `@id.value` in
// expressions, and for CopyFieldAction. What the learner SEES at each
// position is content: <Tick> children carry Markdown labels (words, emoji,
// images), never the stored value itself.
//
// A five-step Likert item is this block with five labeled ticks and
// snap="ticks"; a continuum is the same block with endpoint ticks only.
//
// TODO(shorthand): plain numeric ticks are the common case, and three <Tick>
// children for 0% / 50% / 100% is verbose. Planned, following Perseus's
// number-line vocabulary: tickStep="25" or ticks="0 50 100" generate
// number-labeled ticks (locale-formatted); unit="%" is appended to generated
// labels; labelTicks="false" draws bare marks; a <Tick> child at a generated
// value replaces it. The value contract does not change. If this is not done
// before the merge to main, it is a review item there.
//
import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { decodedFieldSelector, commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { z_olx_boolean, z_olx_number, z_expression } from '@/lib/blocks/attributeSchemas';
import { validateRawTicks } from './tickHelpers';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([
  commonFields.value,
  { name: 'readonly', schema: z_olx_boolean },
]);

// The kids parser, wrapped below so tick positions can be checked against
// this block's own min/max BEFORE the children are parsed. validateChildren
// is the usual home for structural checks, but it is handed only (kids,
// idMap) — no attributes — and "is this tick inside the range?" is a
// question about the parent's range.
const kidsParser = parsers.blocks();

const NumberLineInput = core({
  ...kidsParser,
  parser: async (ctx: any) => {
    validateRawTicks(ctx);
    return kidsParser.parser(ctx);
  },
  name: 'NumberLineInput',
  ...input({ valueSchema: z.number() }),
  description: 'Select one position on a horizontal number line. Ticks and endpoints are labeled with content (words, emoji, images); the stored value is a number.',
  fields,
  attributes: z.object({
    min: z_olx_number.default(0).describe('Lowest position on the line'),
    max: z_olx_number.default(100).describe('Highest position on the line'),
    step: z_olx_number.default(1).describe('Granularity of positions; use a small fraction (e.g. 0.01) for a continuum'),
    snap: z.enum(['step', 'ticks']).optional()
      .describe('What the committed value snaps to: "step" (default without ticks) or "ticks" (default with ticks)'),
    initial: z_expression.optional()
      .describe('Expression for where the thumb rests while unanswered (e.g. "50", "@score.value"). Not the value — the value stays unset until the learner acts. Defaults to the midpoint.'),
    reference: z_expression.optional()
      .describe('Expression for a fixed, non-draggable marker on the same line (e.g. "where you are now")'),
    referenceLabel: z.string().optional().describe('Short plain-text label shown above the reference marker'),
    readonly: z_olx_boolean.optional().describe('Show the line without allowing changes'),
    showValue: z_olx_boolean.optional().describe('Print the current position (or its tick label) beside the line'),
  }).strict(),
  validateAttributes: (attrs) => {
    const errors: string[] = [];
    if (!(attrs.step > 0)) {
      errors.push('step must be greater than 0 (a continuum is a small step, e.g. step="0.01")');
    }
    if (!(attrs.min < attrs.max)) {
      errors.push(`min (${attrs.min}) must be less than max (${attrs.max})`);
    }
    return errors.length > 0 ? errors : undefined;
  },
  // The learner's position, as a number. Undefined until they act — an
  // unanswered line has no value, only a resting place for the thumb.
  selectors: {
    value: (reduxState, props: RuntimeProps, _stateKey) => {
      const v = decodedFieldSelector(reduxState, props, fields.value);
      return v === undefined || v === null ? undefined : Number(v);
    },
  },
});

export default NumberLineInput;
