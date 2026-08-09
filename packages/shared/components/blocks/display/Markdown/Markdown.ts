import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Markdown = core({
  // Compatibility: Markdown historically treated {{...}} as state templates.
  // New text blocks default to literal text unless template="state" is authored.
  ...parsers.text.withTarget.stripIndent({ defaultTemplate: 'state' }),
  name: 'Markdown',
  description: 'Render Markdown formatted text.',
});

export default Markdown;
