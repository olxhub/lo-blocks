// packages/shared/components/blocks/rubric/Conjunction.ts
//
// Several checks that gate TOGETHER under one code.
//
// The distinction from a gating `Slot` is what it says when it fails. Four
// independent gates charge the FIRST unsatisfied one; a conjunction reports ALL
// of them -- "Missing: operant_behavior, stimulus" is one finding about four
// readings, and the singles cannot express it. Declaring both over the same
// slots charges the same failure twice and disagrees about the wording.
//
// Renders nothing: rubric content is data other things are generated from.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Conjunction = core({
  ...parsers.ignore(),
  name: 'Conjunction',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY -- the same
  // reasoning as `Onlyif`. Every operant item declares the same definitional
  // conjunction, which is one statement made eight times, not eight conflicts.
  requiresUniqueId: false,
  description: 'Checks that gate together under one code, naming every one that failed.',
  attributes: z.object({
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    code: z.string().describe('The deduction charged when the conjunction fails.'),
    over: z.string().describe('The checks that must ALL hold, comma-separated.'),
    note: z.string().optional().describe(
      'The wording of the charge. With list="true" the failing checks are ' +
      'appended to it.'),
    list: z.enum(['true', 'false']).optional().describe(
      'Name every failing member after the note, rather than charging silently.'),
  }),
});

export default Conjunction;
