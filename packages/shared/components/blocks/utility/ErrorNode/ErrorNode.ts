// packages/shared/components/blocks/utility/ErrorNode/ErrorNode.ts
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { z_errorNodeAttributes } from '@/lib/types/errors';
import { _ErrorNode } from './_ErrorNode';

const ErrorNode = core({
  ...parsers.blocks(),
  name: 'ErrorNode',
  description: 'Displays content loading and parsing errors in a user-friendly format',
  internal: true,
  // Deliberately eager (not componentLoader): this is the error-rendering
  // path. Showing a parse error must never depend on a lazy chunk loading —
  // a failed chunk fetch while rendering an error would cascade.
  component: _ErrorNode,
  attributes: z_errorNodeAttributes,
});

export default ErrorNode;
