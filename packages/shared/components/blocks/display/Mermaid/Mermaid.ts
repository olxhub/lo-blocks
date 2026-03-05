import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import _Mermaid from './_Mermaid';

export const fields = state.fields(['error']);

const Mermaid = core({
  ...parsers.text.stripIndent(),
  name: 'Mermaid',
  component: _Mermaid,
  description: 'Render Mermaid diagrams (flowcharts, sequence diagrams, Gantt charts, etc.).',
  requiresUniqueId: false,
  fields,
  attributes: srcAttributes.strict(),
});

export default Mermaid;
