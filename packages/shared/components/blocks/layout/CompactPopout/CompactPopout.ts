import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { z_reduxStateKey } from '@/lib/blocks/attributeSchemas';
import _CompactPopout from './_CompactPopout';

export const fields = state.fields(['expanded']);

const CompactPopout = dev({
  ...parsers.blocks(),
  name: 'CompactPopout',
  description: 'Wraps children in a popout overlay that auto-expands on first render. When closed, shows a compact placeholder button.',
  component: _CompactPopout,
  fields,
  attributes: z.object({
    label: z.string().optional().describe('Placeholder text shown when collapsed (e.g. "View the research paper")'),
    mode: z.enum(['fullscreen', 'window', 'target']).optional().describe('Display mode: "fullscreen" uses the Fullscreen API, "window" uses a fixed overlay, "target" repoints a component. Defaults to "window".'),
    autoOpen: z.boolean().default(false).describe('If true, auto-expand on first render. Defaults to false.'),
    target: z_reduxStateKey.optional().describe('Component ID to repoint (mode="target" only, e.g. "sidebar")'),
    targetContent: z_reduxStateKey.optional().describe('Block ID to display in the target (mode="target" only)'),
  }).strict(),
});

export default CompactPopout;
