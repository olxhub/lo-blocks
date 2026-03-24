// src/components/blocks/specialized/TeamDirectory/TeamDirectory.js

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes, cast } from '@/lib/blocks/attributeSchemas';
import { z } from 'zod';
import { withCastSupport } from '@/lib/avatar/cast';
import _TeamDirectory from './_TeamDirectory';

export const fields = state.fields([
  'selectedMember',   // Currently selected team member ID
  'viewMode'          // 'grid' or 'detail' view mode
]);

const TeamDirectory = dev({
  ...withCastSupport(parsers.blocks()),
  name: 'TeamDirectory',
  description: 'Interactive team directory showing team members with details and bios',
  component: _TeamDirectory,
  fields: fields,
  attributes: baseAttributes.extend({
    ...cast,
    group: z.string().optional()
      .describe('Filter to cast members belonging to this group'),
    title: z.string().optional()
      .describe('Directory heading'),
  }),
  selectValue: (props, state, _reduxKey) => {
    const selectedMember = fieldSelector(state, props, fields.selectedMember, { fallback: null });
    const viewMode = fieldSelector(state, props, fields.viewMode, { fallback: 'grid' });
    return { selectedMember, viewMode };
  }
});

export default TeamDirectory;
