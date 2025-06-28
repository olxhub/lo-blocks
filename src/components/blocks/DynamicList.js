// src/components/blocks/DynamicList.js
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _DynamicList from './_DynamicList';

export const fields = state.fields(['count']);

const DynamicList = core({
  ...parsers.blocks,
  name: 'DynamicList',
  component: _DynamicList,
  fields,
});

export default DynamicList;
