import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Markdown = core({
  ...parsers.text.withTarget.stripIndent(),
  name: 'Markdown',
  description: 'Render Markdown formatted text.',
});

export default Markdown;
