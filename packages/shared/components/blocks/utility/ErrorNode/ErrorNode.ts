// src/components/blocks/ErrorNode/ErrorNode.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { _ErrorNode } from './_ErrorNode';

const ErrorNode = core({
  ...parsers.blocks(),
  name: 'ErrorNode',
  component: _ErrorNode,
  description: 'Displays content loading and parsing errors in a user-friendly format',
  internal: true,
  // Passthrough - ErrorNode inherits attributes from the failed node, which could be anything
  attributes: baseAttributes.passthrough(),
});

export default ErrorNode;