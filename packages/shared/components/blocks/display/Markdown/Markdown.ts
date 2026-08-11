import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';

const Markdown = core({
  // Compatibility: Markdown historically treated {{...}} as state templates.
  // New text blocks default to literal text unless template="state" is authored.
  ...parsers.textWithTemplate(
    parsers.text.withTarget.stripIndent(),
    { defaultMode: 'state' },
  ),
  name: 'Markdown',
  description: 'Render Markdown formatted text.',
});

export default Markdown;
