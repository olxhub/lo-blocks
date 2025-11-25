// src/components/blocks/Correctness.jsx
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { ignore } from '@/lib/content/parsers';
import _Correctness from './_Correctness';

const fields = state.fields(['correct']);

const Correctness = dev({
  ...ignore(),
  name: 'Correctness',
  description: 'Visual indicator showing grading status (correct/incorrect/unsubmitted)',
  component: _Correctness,
  fields
});

export default Correctness;
