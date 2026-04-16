import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

import { _Markdown } from './_Markdown';

const Markdown = core({
  ...parsers.text.withTarget.stripIndent(),
  name: 'Markdown',
  component: _Markdown,
  description: 'Render Markdown formatted text.',
});

export default Markdown;
