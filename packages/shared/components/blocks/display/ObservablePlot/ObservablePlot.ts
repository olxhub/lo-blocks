import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes, src } from '@/lib/blocks/attributeSchemas';
import _ObservablePlot from './_ObservablePlot';

const ObservablePlot = core({
  ...parsers.text.stripIndent(),
  name: 'ObservablePlot',
  component: _ObservablePlot,
  description: 'Render Observable Plot visualizations from YAML or JavaScript specs.',
  requiresUniqueId: false,
  attributes: baseAttributes.extend({
    ...src,
    format: z.enum(['yaml', 'js']).optional()
      .describe('Spec format: yaml (default, also accepts JSON) or js (sandboxed)'),
    width: z.coerce.number().optional().describe('Plot width in pixels'),
    height: z.coerce.number().optional().describe('Plot height in pixels'),
  }).strict(),
});

export default ObservablePlot;
