// src/components/blocks/grading/StringGrader.js
//
// Grader for text string answers - supports exact match and regexp.
//
// Usage:
//   <StringGrader answer="Michigan">
//     <LineInput />
//   </StringGrader>
//
//   <StringGrader answer="colou?r" regexp="true" ignoreCase="true">
//     <LineInput />
//   </StringGrader>
//
//   <StringGrader answer="jupiter" ignoreCase="true">
//     <LineInput />
//   </StringGrader>
//
// Attributes:
//   answer: The expected answer (string or regexp pattern)
//   regexp: If true, treat answer as a regular expression
//   ignoreCase: If true, match is case-insensitive
//
import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { baseAttributes } from '@/lib/blocks';
import { CORRECTNESS } from '@/lib/blocks/correctness.js';
import _Noop from '@/components/blocks/layout/_Noop';
import * as state from '@/lib/state';

export const fields = state.fields(['correct', 'message']);

// Strict boolean schema - only accepts true, false, "true", "false"
const strictBoolean = z.union([
  z.literal(true),
  z.literal(false),
  z.literal('true').transform(() => true),
  z.literal('false').transform(() => false),
]).default(false);

function gradeString(props, { input }) {
  const studentAnswer = (input ?? '').toString().trim();
  const expectedAnswer = (props.answer ?? '').toString();

  if (studentAnswer === '') {
    return { correct: CORRECTNESS.UNSUBMITTED, message: '' };
  }

  const ignoreCase = props.ignoreCase === true;
  const isRegexp = props.regexp === true;

  let isCorrect = false;

  if (isRegexp) {
    try {
      const flags = ignoreCase ? 'i' : '';
      const pattern = new RegExp(`^${expectedAnswer}$`, flags);
      isCorrect = pattern.test(studentAnswer);
    } catch (e) {
      return { correct: CORRECTNESS.INVALID, message: 'Invalid answer pattern' };
    }
  } else {
    if (ignoreCase) {
      isCorrect = studentAnswer.toLowerCase() === expectedAnswer.toLowerCase();
    } else {
      isCorrect = studentAnswer === expectedAnswer;
    }
  }

  return {
    correct: isCorrect ? CORRECTNESS.CORRECT : CORRECTNESS.INCORRECT,
    message: ''
  };
}

const StringGrader = blocks.core({
  ...parsers.blocks.allowHTML(),
  ...blocks.grader({ grader: gradeString }),
  name: 'StringGrader',
  description: 'Grades text answers with exact match or regexp support',
  category: 'grading',
  component: _Noop,
  attributeSchema: baseAttributes.extend({
    answer: z.string({ required_error: 'answer is required' }),
    target: z.string().optional(),
    regexp: strictBoolean,
    ignoreCase: strictBoolean,
  }),
  fields,
  getDisplayAnswer: (props) => props.displayAnswer ?? props.answer,
});

export default StringGrader;
