import * as parsers from '@/lib/olx/parsers';
import { dev } from '../blocks';

import { _DigitSpanTask } from './DigitSpanTaskClient';

// 📋 Friendly description for professors, LLMs, devs
const description = `
This block presents a simple digit span memory task. Students hear a sequence of numbers spoken aloud
and must type them back in the correct order.

Modes:
- Forward: repeat numbers in the order given.
- Backward: repeat numbers in reverse order.
- Ascending: reorder numbers from smallest to largest.

Difficulty adapts based on performance, using a simple IRT-like model where sequence length maps to item difficulty.
Performance updates a rough ability estimate (theta).

Example:
- Hear: "4, 7, 2"
- Forward: "472"
- Backward: "274"
- Ascending: "247"
`;

const DigitSpanTask = dev({
  name: 'DigitSpanTask',
  component: _DigitSpanTask,
  parser: parsers.ignore, // no kids expected
  description
});

export default DigitSpanTask;
