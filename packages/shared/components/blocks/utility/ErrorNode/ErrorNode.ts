// src/components/blocks/ErrorNode/ErrorNode.js
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import { _ErrorNode } from './_ErrorNode';

const ErrorNode = core({
  ...parsers.blocks(),
  name: 'ErrorNode',
  component: _ErrorNode,
  description: 'Displays content loading and parsing errors in a user-friendly format',
  internal: true,
  // TODO (tech debt): ErrorNode should NOT accept arbitrary attributes.
  // It should declare a real, strict schema for the fields it actually
  // renders (name, message, technicalDetails, source block name, …) and
  // discard whatever the broken source node was carrying. The passthrough
  // here is legacy from how the error path grew organically; migrate when
  // the error-rendering code gets its next pass.
  acceptsUnknownAttributes: true,
});

export default ErrorNode;