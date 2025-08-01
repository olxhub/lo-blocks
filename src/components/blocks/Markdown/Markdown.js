import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

import { _Markdown } from './_Markdown';

// TODO: Add support for `src=` attribute
const Markdown = dev({
  ...parsers.text,
  name: 'Markdown',
  component: _Markdown,
  description: 'Render Markdown formatted text.'
});

export default Markdown;
