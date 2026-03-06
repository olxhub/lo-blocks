// PrintAction - triggers the browser print dialog for PDF export.
//
// Usage:
//   <ActionButton label="Export as PDF">
//     <PrintAction />
//   </ActionButton>

import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';

async function printAction() {
  if (typeof window !== 'undefined') window.print();
}

const PrintAction = blocks.core({
  ...parsers.ignore(),
  ...blocks.action({
    action: printAction,
  }),
  name: 'PrintAction',
  description: 'Triggers the browser print dialog for PDF export',
  component: _Noop,
  attributes: baseAttributes,
});

export default PrintAction;
