// src/components/blocks/reference/AggregatedInputs.js
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { ignore } from '@/lib/content/parsers';
import _AggregatedInputs from './_AggregatedInputs';

const AggregatedInputs = dev({
  ...ignore(),
  name: 'AggregatedInputs',
  namespace: 'org.mitros.dev',
  description: 'Aggregates grader correctness values and displays progress.',
  component: _AggregatedInputs
});

export default AggregatedInputs;