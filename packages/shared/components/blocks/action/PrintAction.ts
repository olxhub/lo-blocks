// PrintAction - triggers the browser print dialog for PDF export.
//
// Usage:
//   <ActionButton label="Export as PDF">
//     <PrintAction />
//   </ActionButton>

import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';

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
  // Shared no-op renderer lives in layout/, not a sibling of this file.
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
});

export default PrintAction;
