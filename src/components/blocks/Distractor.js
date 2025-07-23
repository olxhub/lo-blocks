// src/components/blocks/Distractor.js
import { dev } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _ChoiceItem from './_ChoiceItem.jsx';

const Distractor = dev({
  ...parsers.text,
  name: 'Distractor',
  component: _ChoiceItem,
});

export default Distractor;
