import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { z_reduxStateRef } from '@/lib/blocks/attributeSchemas';
import _WritingRhythmPlot from './_WritingRhythmPlot';

const WritingRhythmPlot = core({
  ...parsers.ignore(),
  name: 'WritingRhythmPlot',
  requiresUniqueId: false,
  component: _WritingRhythmPlot,
  description: 'Bar chart of sentence lengths with word-length stacking, reading from a target TextArea.',
  attributes: z.object({
    target: z_reduxStateRef.describe('ID of TextArea to analyze'),
    mode: z.enum(['characters', 'words']).optional()
      .describe('Bar segment height: characters (default, height = letter count) or words (uniform height, bar = word count)'),
    xrange: z.coerce.number().optional().describe('Fix x-axis to this many sentence slots (for common axes across multiple plots)'),
    yrange: z.coerce.number().optional().describe('Fix y-axis maximum (for common axes across multiple plots)'),
    width: z.coerce.number().optional().describe('Chart width in pixels'),
    height: z.coerce.number().optional().describe('Chart height in pixels'),
  }).strict(),
});

export default WritingRhythmPlot;
