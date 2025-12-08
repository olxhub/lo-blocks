// src/components/blocks/reference/AggregatedInputs.js
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { ignore } from '@/lib/content/parsers';
import _AggregatedInputs from './_AggregatedInputs';

export const fields = state.fields(['correct']);

const AggregatedInputs = dev({
  ...ignore(),
  name: 'AggregatedInputs',
  namespace: 'org.mitros.dev',
  description: 'Aggregates grader correctness values and displays progress.',
  component: _AggregatedInputs,
  fields,
});

export default AggregatedInputs;