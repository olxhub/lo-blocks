// WordUsage — analyzes writing patterns in text from a target block.
//
// Four analysis modes:
//   repeated_words    — content words used 2+ times, intensity escalates
//   sentence_starters — first word of each sentence, color per unique starter
//   alliteration      — runs of 2+ words sharing initial letter
//   transition_words  — words from a provided list
//
// Usage:
//   <TextArea id="essay" rows="8" />
//   <WordUsage target="essay" mode="repeated_words" />
//   <WordUsage target="essay" mode="transition_words">however, therefore</WordUsage>

import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { z_stateRef, z_olx_boolean, src } from '@/lib/blocks/attributeSchemas';

const WordUsage = dev({
  ...parsers.textToAttribute('words'),
  name: 'WordUsage',
  requiresUniqueId: false,
  description: 'Analyzes writing patterns (repeated words, sentence starters, alliteration, transition words) in text from a target block.',
  attributes: z.object({
    ...src,
    target: z_stateRef.describe('ID of the block whose text to analyze'),
    mode: z.enum(['repeated_words', 'sentence_starters', 'alliteration', 'transition_words'])
      .describe('Analysis mode'),
    summary: z_olx_boolean.default(true)
      .describe('Show summary strip at bottom'),
    highlight: z_olx_boolean.default(true)
      .describe('Show highlighted text'),
    words: z.string().optional()
      .describe('Comma-separated word/phrase list (for transition_words mode)'),
  }).strict(),
});

export default WordUsage;
