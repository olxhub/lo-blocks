// src/components/blocks/HelloAction.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';

const HelloAction = blocks.test({
  ...parsers.ignore(),
  ...blocks.action({
    action: () => alert("Hello, World!")
  }),
  name: 'HelloAction',
  description: 'Testing block that shows "Hello, World!" alert when triggered',
  component: _Noop,
  attributes: baseAttributes.strict(),
});

export default HelloAction;
