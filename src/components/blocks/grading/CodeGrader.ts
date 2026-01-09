// src/components/blocks/grading/CodeGrader.ts
//
// Grader that executes author-provided JavaScript code for custom grading logic.
//
// This enables grading scenarios that can't be expressed with simple pattern matching:
// - Partial credit based on how close an answer is
// - Custom parsing (e.g., accepting "1/2" or "0.5" or "50%")
// - Multiple correct answers with different feedback
// - Complex validation logic
//
// Usage:
//   <CodeGrader>
//     if (input === 42) return { correct: 'correct', message: 'Perfect!' };
//     if (Math.abs(input - 42) < 5) return { correct: 'partially-correct', message: 'Close!', score: 0.5 };
//     return { correct: 'incorrect', message: 'Try again' };
//   </CodeGrader>
//
// The code has access to:
//   - input: The student's answer (single input case)
//   - inputs: Array of all inputs (multiple input case)
//   - CORRECTNESS: The correctness enum for return values
//
// The code must return an object with:
//   - correct: CORRECTNESS value or string ('correct', 'incorrect', 'partially-correct', 'invalid')
//   - message: Feedback string (optional)
//   - score: Numeric score 0-1 (optional, defaults based on correct value)
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { CORRECTNESS } from '@/lib/blocks/correctness';
import _Hidden from '@/components/blocks/layout/_Hidden';

/**
 * Normalize correctness value to CORRECTNESS enum.
 * Accepts both string shortcuts and enum values.
 */
function normalizeCorrectness(value: unknown): string {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'correct' || lower === CORRECTNESS.CORRECT) return CORRECTNESS.CORRECT;
    if (lower === 'incorrect' || lower === CORRECTNESS.INCORRECT) return CORRECTNESS.INCORRECT;
    if (lower === 'partially-correct' || lower === 'partial' || lower === CORRECTNESS.PARTIALLY_CORRECT) {
      return CORRECTNESS.PARTIALLY_CORRECT;
    }
    if (lower === 'invalid' || lower === CORRECTNESS.INVALID) return CORRECTNESS.INVALID;
    if (lower === 'unsubmitted' || lower === CORRECTNESS.UNSUBMITTED) return CORRECTNESS.UNSUBMITTED;
  }
  // Boolean shortcuts
  if (value === true) return CORRECTNESS.CORRECT;
  if (value === false) return CORRECTNESS.INCORRECT;

  // Already a CORRECTNESS value or unknown
  return String(value);
}

/**
 * Execute author-provided grading code in a controlled environment.
 *
 * The code runs with access to:
 * - input: single input value
 * - inputs: array of all input values
 * - CORRECTNESS: enum for return values
 * - Math: standard Math object
 *
 * Security note: This executes author-trusted code, not student input.
 * Authors have the same trust level as the OLX content itself.
 */
function executeGradingCode(
  code: string,
  context: { input: unknown; inputs: unknown[] }
): { correct: string; message: string; score?: number } {
  try {
    // Wrap code in a function that can use return statements
    const wrappedCode = `
      'use strict';
      return (function() {
        ${code}
      })();
    `;

    // Create function with controlled scope
    // eslint-disable-next-line no-new-func
    const fn = new Function('input', 'inputs', 'CORRECTNESS', 'Math', wrappedCode);

    // Execute with context
    const result = fn(context.input, context.inputs, CORRECTNESS, Math);

    // Validate result structure
    if (result === null || result === undefined) {
      return {
        correct: CORRECTNESS.INVALID,
        message: 'Grading code returned null/undefined',
      };
    }

    if (typeof result !== 'object') {
      // Allow simple boolean return
      if (typeof result === 'boolean') {
        return {
          correct: result ? CORRECTNESS.CORRECT : CORRECTNESS.INCORRECT,
          message: '',
        };
      }
      return {
        correct: CORRECTNESS.INVALID,
        message: `Grading code returned ${typeof result}, expected object`,
      };
    }

    return {
      correct: normalizeCorrectness(result.correct),
      message: String(result.message ?? ''),
      score: typeof result.score === 'number' ? result.score : undefined,
    };
  } catch (error) {
    console.error('[CodeGrader] Execution error:', error);
    return {
      correct: CORRECTNESS.INVALID,
      message: `Grading error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Extract code content from kids.
 * Handles both string content and text node arrays.
 */
function extractCode(kids: unknown): string {
  if (typeof kids === 'string') {
    return kids.trim();
  }

  if (Array.isArray(kids)) {
    return kids
      .map((kid) => {
        if (typeof kid === 'string') return kid;
        if (typeof kid === 'object' && kid?.type === 'text') return kid.text;
        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

function gradeCode(props, { input, inputs }) {
  const code = extractCode(props.kids);

  if (!code) {
    return {
      correct: CORRECTNESS.INVALID,
      message: 'No grading code provided',
    };
  }

  // Handle unsubmitted case
  if (input === undefined || input === null || input === '') {
    return {
      correct: CORRECTNESS.UNSUBMITTED,
      message: '',
    };
  }

  return executeGradingCode(code, { input, inputs: inputs ?? [input] });
}

const CodeGrader = createGrader({
  base: 'Code',
  description: 'Grades answers using custom JavaScript code for complex grading logic',
  grader: gradeCode,
  attributes: {
    // target is required since we can't infer inputs from children
    target: z.string({ required_error: 'target is required - specify the input block(s) to grade' }),
  },
  // Children are code, not inputs - require explicit target
  infer: false,
  // No CodeMatch block - code grading isn't a simple predicate
  createMatch: false,
  // No display answer - code graders have custom logic
  getDisplayAnswer: () => undefined,
  // Hide the code from rendering (children are code, not content)
  component: _Hidden,
});

export default CodeGrader;
