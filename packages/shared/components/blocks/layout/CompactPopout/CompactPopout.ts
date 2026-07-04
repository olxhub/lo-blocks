import { z } from 'zod';
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';

// `expanded`  — overlay open/closed (fullscreen/window modes)
// `repointed` — target mode: whether this popout has already done its one-time
//   repoint. Persisted so that on restore (when every previously-revealed embed
//   re-mounts at once) we DON'T re-fire the repoint and clobber the target's
//   restored value. The repoint is a one-time reveal event, not a per-mount one.
export const fields = state.fields(['expanded', 'repointed']);

const CompactPopout = dev({
  ...parsers.blocks(),
  name: 'CompactPopout',
  description: 'Wraps children in a popout overlay that auto-expands on first render. When closed, shows a compact placeholder button.',
  fields,
  attributes: z.object({
    label: z.string().optional().describe('Placeholder text shown when collapsed (e.g. "View the research paper")'),
    mode: z.enum(['fullscreen', 'window', 'target']).optional().describe('Display mode: "fullscreen" uses the Fullscreen API, "window" uses a fixed overlay, "target" repoints a component. Defaults to "window".'),
    autoOpen: z.boolean().default(false).describe('If true, auto-expand on first render. Defaults to false.'),
    target: z_stateRef.optional().describe('Component ID to repoint (mode="target" only, e.g. "sidebar")'),
    targetContent: z_stateRef.optional().describe('Block ID to display in the target (mode="target" only)'),
  }).strict(),
});

export default CompactPopout;
