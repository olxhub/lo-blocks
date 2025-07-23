// src/components/blocks/Key.js
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _ChoiceItem from './_ChoiceItem.jsx';

const Key = dev({
  ...parsers.text,
  name: 'Key',
  component: _ChoiceItem,
});

export default Key;
