import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';

export const fields = state.fields(['error']);

// No component import: the registry generator wires ./_Mermaid as a lazy
// componentLoader, so the mermaid dependency tree loads only when a
// diagram actually renders.
const Mermaid = core({
  ...parsers.text.withTarget.stripIndent(),
  name: 'Mermaid',
  description: 'Render Mermaid diagrams (flowcharts, sequence diagrams, Gantt charts, etc.).',
  fields,
});

export default Mermaid;
