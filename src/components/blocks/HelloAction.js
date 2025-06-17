// src/components/blocks/HelloAction.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import _Noop from './_Noop';

const HelloAction = blocks.test({
  ...parsers.ignore,
  ...blocks.action({
    action: ()=>alert("Hello, World!")
  }),
  name: 'HelloAction',
  component: _Noop
});

export default HelloAction;
