// src/components/blocks/ErrorNode/ErrorNode.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { _ErrorNode } from './_ErrorNode.jsx';

const ErrorNode = core({
  ...parsers.blocks,
  name: 'ErrorNode',
  component: _ErrorNode,
  namespace: 'org.mitros.core',
  description: 'Displays content loading and parsing errors in a user-friendly format'
});

export default ErrorNode;