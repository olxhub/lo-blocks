// src/components/blocks/grading/StringGrader.ts
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
// The pure match function `stringMatch` is available in DSL expressions:
//   stringMatch(@answer.value, 'Paris', { ignoreCase: true })
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { stringMatch, validateStringAttributes } from './stringMatch';

// Re-export for convenience
export { stringMatch, validateStringAttributes } from './stringMatch';
export type { StringMatchOptions } from './stringMatch';

// Strict boolean schema - only accepts true, false, "true", "false"
const strictBoolean = z.union([
  z.literal(true),
  z.literal(false),
  z.literal('true').transform(() => true),
  z.literal('false').transform(() => false),
]).default(false);

const StringGrader = createGrader({
  base: 'String',
  description: 'Grades text answers with exact match or regexp support',
  match: stringMatch,
  inputSchema: z.string(),  // Single string input
  attributes: {
    answer: z.string({ required_error: 'answer is required' }),
    regexp: strictBoolean,
    ignoreCase: strictBoolean,
  },
  validateAttributes: validateStringAttributes,
});

export default StringGrader;
