// packages/shared/components/blocks/rubric/Derived.ts
//
// A check read off the page rather than asked of a model: a field's presence,
// a word search, a set of numbers that would plot.
//
// Renders nothing.

import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Derived = core({
  ...parsers.ignore(),
  name: 'Derived',
  // A RUBRIC BLOCK IS DATA, NOT A PAGE ELEMENT WITH IDENTITY. Ids here are
  // derived from content, so two items carrying the same guidance line, the
  // same slot or the same deduction text collide -- and that is not a
  // conflict, it is the same statement made twice. Without this the rubric
  // raises hundreds of DUPLICATE_ID errors on a file that is perfectly
  // well formed. Same reasoning as `Distractor`, which shares it.
  requiresUniqueId: false,
  description: 'A check read off the learners own fields.',
  attributes: z.object({
    ifDeclared: z.string().optional().describe(
      'Inside an ItemTemplate: include this child only when the item declares ' +
      'this condition. Prefix "!" to invert. Consumed by the build.'),
    key: z.string().describe('The check this computes.'),
    kind: z.string().describe('How it is read: present, contains, plots, complete.'),
    fields: z.string().optional().describe('The fields it reads, comma-separated.'),
    words: z.string().optional().describe('For a word search: the words.'),
    template: z.string().optional().describe(
      'For a plot: the worked example rows, ";"-separated, values ","-separated.'),
  }),
  internal: true,
});

export default Derived;
