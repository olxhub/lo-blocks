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
import { createGrader } from '@/lib/blocks';
import { CORRECTNESS } from '@/lib/blocks/correctness.js';

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

const StringGrader = createGrader({
  base: 'String',
  description: 'Grades text answers with exact match or regexp support',
  grader: gradeString,
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
    regexp: strictBoolean,
    ignoreCase: strictBoolean,
  },
});

export default StringGrader;
