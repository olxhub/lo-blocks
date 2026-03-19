import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';

import { _Markdown } from './_Markdown';

const Markdown = core({
  ...parsers.text.stripIndent(),
  name: 'Markdown',
  component: _Markdown,
  description: 'Render Markdown formatted text.',
  requiresUniqueId: false,
  attributes: srcAttributes.strict(),
});

export default Markdown;
