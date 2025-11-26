// src/components/blocks/ChoiceInput/Distractor.js
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _ChoiceItem from './_ChoiceItem.jsx';

const Distractor = dev({
  ...parsers.text(),
  name: 'Distractor',
  description: 'Incorrect answer choice option for multiple choice questions',
  component: _ChoiceItem,
});

export default Distractor;
