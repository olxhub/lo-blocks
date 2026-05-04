// src/components/blocks/ErrorNode/ErrorNode.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { _ErrorNode } from './_ErrorNode';
import { z_errorNodeAttributes } from '@/lib/types/errors';

const ErrorNode = core({
  ...parsers.blocks(),
  name: 'ErrorNode',
  component: _ErrorNode,
  description: 'Displays content loading and parsing errors in a user-friendly format',
  internal: true,
  attributes: z_errorNodeAttributes,
});

export default ErrorNode;
