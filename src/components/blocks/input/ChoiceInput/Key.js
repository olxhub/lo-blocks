// src/components/blocks/ChoiceInput/Key.js
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _ChoiceItem from './_ChoiceItem.jsx';

const Key = dev({
  ...parsers.text(),
  name: 'Key',
  description: 'Correct answer choice option for multiple choice questions',
  component: _ChoiceItem,
});

export default Key;
