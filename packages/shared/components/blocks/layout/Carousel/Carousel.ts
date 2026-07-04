// Carousel - browse and select from a list of items with left/right navigation.
//
// Usage with inline ID list:
//   <Carousel id="location">
//     great_wall, machu_picchu, pyramids
//   </Carousel>
//
// Or with external file:
//   <Carousel id="location" src="locations.idlistpeg" />
//
// Items are defined elsewhere as blocks with `title` attributes.
// The Carousel's value is the ID of the currently-displayed item.
// The title is available via <Ref target="location" field="title" />.

import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { commonFields } from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes, z_olx_boolean } from '@/lib/blocks/attributeSchemas';
import * as idListParser from '@/components/blocks/specialized/MasteryBank/_idlistParser';

export const fields = state.fields([commonFields.value, { name: 'title' }, { name: 'readonly', schema: z_olx_boolean }, { name: 'order' }]);

const Carousel = core({
  ...peggyParser(idListParser, {
    postprocess: ({ parsed }) => {
      return { type: 'parsed', itemIds: parsed };
    }
  }),
  name: 'Carousel',
  description: 'Browse and select from a list of referenced items with left/right navigation',
  fields,
  attributes: srcAttributes.extend({
    wrap: z_olx_boolean.optional().describe('Enable circular navigation (wrap around at ends)'),
    readonly: z_olx_boolean.optional().describe('Hide navigation arrows (view-only mode)'),
    randomize: z_olx_boolean.optional().describe('Shuffle item order (stored in Redux so it stays consistent)'),
  }),
});

export default Carousel;
