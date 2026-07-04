import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const ObservablePlot = core({
  ...parsers.text.withTarget.stripIndent(),
  name: 'ObservablePlot',
  description: 'Render Observable Plot visualizations from YAML or JavaScript specs.',
  attributes: z.object({
    format: z.enum(['yaml', 'js']).optional()
      .describe('Spec format: yaml (default, also accepts JSON) or js (sandboxed)'),
    width: z.coerce.number().optional().describe('Plot width in pixels'),
    height: z.coerce.number().optional().describe('Plot height in pixels'),
  }).strict(),
});

export default ObservablePlot;
