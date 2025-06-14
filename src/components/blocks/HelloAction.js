// src/components/blocks/HelloAction.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';

const HelloAction = blocks.test({
  ...parsers.ignore,
  ...blocks.action({
    action: ()=>alert("Hello, World!")
  }),
  name: 'HelloAction',
  component: blocks.NoopBlock
});

export default HelloAction;
