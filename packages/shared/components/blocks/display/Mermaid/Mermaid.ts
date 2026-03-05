import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import _Mermaid from './_Mermaid';

const Mermaid = core({
  ...parsers.text.stripIndent(),
  name: 'Mermaid',
  component: _Mermaid,
  description: 'Render Mermaid diagrams (flowcharts, sequence diagrams, Gantt charts, etc.).',
  requiresUniqueId: false,
  attributes: srcAttributes.strict(),
});

export default Mermaid;
