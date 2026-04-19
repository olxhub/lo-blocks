import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
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
    mode: z.enum(['fullscreen', 'window']).optional().describe('Popout mode: "fullscreen" uses the Fullscreen API, "window" uses a fixed overlay. Defaults to "window".'),
  }).strict(),
});

export default CompactPopout;
