import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import _Mermaid from './_Mermaid';

export const fields = state.fields(['error']);

const Mermaid = core({
  ...parsers.text.withTarget.stripIndent(),
  name: 'Mermaid',
  component: _Mermaid,
  description: 'Render Mermaid diagrams (flowcharts, sequence diagrams, Gantt charts, etc.).',
  fields,
});

export default Mermaid;
