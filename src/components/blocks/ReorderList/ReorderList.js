// src/components/blocks/ReorderList/ReorderList.js
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import _ReorderList from './_ReorderList';

export const fields = state.fields(['order']);

const ReorderList = dev({
  ...parsers.blocks,
  name: 'ReorderList',
  component: _ReorderList,
  fields,
  getValue: (reduxState, id) => reduxState?.[id]?.order ?? [],
});

export default ReorderList;
