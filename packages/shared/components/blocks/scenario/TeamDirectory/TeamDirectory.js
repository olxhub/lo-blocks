// packages/shared/components/blocks/scenario/TeamDirectory/TeamDirectory.js

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import { childParser } from '@/lib/content/parsers';
import { cast } from '@/lib/blocks/attributeSchemas';
import { z } from 'zod';
import { withCastSupport, parseCastYaml } from '@/lib/avatar/cast';
import _TeamDirectory from './_TeamDirectory';

export const fields = state.fields([
  'selectedMember',   // Currently selected team member ID
  'viewMode'          // 'grid' or 'detail' view mode
]);

/**
 * Parser: body text → YAML cast stored as kids.
 *
 * Allows inline cast definitions:
 *   <TeamDirectory id="team" title="Our Team">
 *   Kim:
 *     seed: kim_researcher
 *   </TeamDirectory>
 *
 * The component merges: runtime.cast ← cast= attribute ← body (kids).
 */
const castBody = childParser(async function castBodyParser({ rawKids }) {
  let bodyText = '';
  for (const node of rawKids) {
    if (typeof node === 'object' && '#text' in node && typeof node['#text'] === 'string') {
      bodyText += node['#text'];
    }
  }
  if (!bodyText.trim()) return {};
  return parseCastYaml(bodyText);
});
castBody.staticKids = () => [];

const TeamDirectory = dev({
  ...withCastSupport(castBody()),
  name: 'TeamDirectory',
  description: 'Interactive team directory showing team members with details and bios',
  component: _TeamDirectory,
  fields: fields,
  attributes: z.object({
    ...cast,
    group: z.string().optional()
      .describe('Filter to cast members belonging to this group'),
    // `title` (used as the directory heading) comes from baseAttributes.
  }).strict(),
  selectValue: (props, state, _stateKey) => {
    const selectedMember = fieldSelector(state, props, fields.selectedMember, { fallback: null });
    const viewMode = fieldSelector(state, props, fields.viewMode, { fallback: 'grid' });
    return { selectedMember, viewMode };
  }
});

export default TeamDirectory;
