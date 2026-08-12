import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { resolveConfig } from '@/lib/config';

const ObservablePlot = core({
  ...parsers.textWithTemplate(parsers.text.withTarget.stripIndent()),
  name: 'ObservablePlot',
  description: 'Render Observable Plot visualizations from YAML or JavaScript specs.',
  attributes: z.object({
    format: z.enum(['yaml', 'js']).optional()
      .describe('Spec format: yaml (default, also accepts JSON) or unsandboxed js'),
    width: z.coerce.number().optional().describe('Plot width in pixels'),
    height: z.coerce.number().optional().describe('Plot height in pixels'),
  }).strict(),
  validateAttributes: (attrs, context) => {
    if (attrs.format !== 'js') return undefined;

    const errors: string[] = [];
    if (resolveConfig(context, 'allow-unsafe-content') !== 'true') {
      errors.push(
        'format="js" executes unsandboxed JavaScript and is disabled. ' +
        'Enable allow-unsafe-content only where executable content cannot cross a trust boundary.',
      );
    }
    if (attrs.template === 'state') {
      errors.push(
        'template="state" is not supported with format="js": interpolated state ' +
        'would become executable JavaScript. Use YAML or author the JavaScript spec directly.',
      );
    }
    return errors.length > 0 ? errors : undefined;
  },
});

export default ObservablePlot;
