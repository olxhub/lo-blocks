// src/components/blocks/scenario/TeamDirectory/TeamDirectory.js

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector } from '@/lib/state';
import { baseAttributes, cast } from '@/lib/blocks/attributeSchemas';
import { z } from 'zod';
import { withCastSupport, parseCastYaml, mergeCasts } from '@/lib/avatar/cast';
import _TeamDirectory from './_TeamDirectory';

export const fields = state.fields([
  'selectedMember',   // Currently selected team member ID
  'viewMode'          // 'grid' or 'detail' view mode
]);

/**
 * Parser: body text → YAML cast, merged into attributes.cast.
 *
 * Allows inline cast definitions:
 *   <TeamDirectory id="team" title="Our Team">
 *   Kim:
 *     seed: kim_researcher
 *     openPeeps:
 *       face: smile
 *   </TeamDirectory>
 *
 * Merge order: cast= attribute ← body YAML (body is most specific).
 * Wrapped with withCastSupport so cast= file loading also works.
 */
function castBody() {
  return {
    parser: async function castBodyParser(ctx) {
      const { id, tag, attributes, provenance, rawParsed, storeEntry, metadata } = ctx;
      const tagParsed = rawParsed[tag];
      const nodes = Array.isArray(tagParsed) ? tagParsed : [tagParsed];

      let bodyText = '';
      for (const node of nodes) {
        if (typeof node === 'object' && '#text' in node && typeof node['#text'] === 'string') {
          bodyText += node['#text'];
        }
      }

      let bodyCast = {};
      if (bodyText.trim()) {
        bodyCast = parseCastYaml(bodyText);
      }
      const mergedCast = mergeCasts(attributes?.cast, bodyCast);

      storeEntry(id, {
        id, tag,
        attributes: {
          ...attributes,
          cast: Object.keys(mergedCast).length > 0 ? mergedCast : undefined,
        },
        provenance,
        kids: [],
        ...(metadata || {}),
      });
      return id;
    },
    staticKids: () => [],
  };
}

const TeamDirectory = dev({
  ...withCastSupport(castBody()),
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
