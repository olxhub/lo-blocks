// src/components/blocks/specialized/TeamDirectory/TeamDirectory.js

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _TeamDirectory from './_TeamDirectory';

export const fields = state.fields([
  'selectedMember',   // Currently selected team member ID
  'viewMode'          // 'grid' or 'detail' view mode
]);

const TeamDirectory = dev({
  ...parsers.blocks(),
  name: 'TeamDirectory',
  description: 'Interactive team directory showing team members with details and bios',
  component: _TeamDirectory,
  fields: fields,
  attributes: baseAttributes.strict(),
  getValue: (props, state, id) => {
    const selectedMember = fieldSelector(state, props, fields.selectedMember, { fallback: null, id });
    const viewMode = fieldSelector(state, props, fields.viewMode, { fallback: 'grid', id });
    return { selectedMember, viewMode };
  }
});

export default TeamDirectory;
