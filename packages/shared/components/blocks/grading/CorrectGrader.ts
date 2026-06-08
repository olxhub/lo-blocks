// packages/shared/components/blocks/grading/CorrectGrader.ts
//
// Always-correct grader for surveys and ungraded activities.
// Marks any submission as correct regardless of input.
//
// Usage:
//   <CapaProblem>
//     <CorrectGrader>
//       <CheckboxInput>
//         <Key id="a">Option A</Key>
//         <Key id="b">Option B</Key>
//       </CheckboxInput>
//     </CorrectGrader>
//   </CapaProblem>
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { correctness } from '@/lib/blocks/correctness';

function gradeAlwaysCorrect() {
  return { correct: correctness.correct, message: '' };
}

const CorrectGrader = createGrader({
  base: 'Correct',
  description: 'Always-correct grader for surveys and ungraded activities',
  grader: gradeAlwaysCorrect,
  inputSchema: z.any(),
  createMatch: false,
  getDisplayAnswer: () => undefined,
});

export default CorrectGrader;
