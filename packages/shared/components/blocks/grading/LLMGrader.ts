// packages/shared/components/blocks/grading/LLMGrader.ts
//
// LLMGrader - grades free-form answers with an LLM. The first concrete
// ASYNC grader: the grading action two-phase dispatches
// (correct='submitted' while the call is in flight, locking inputs; the
// final verdict when it lands). See grader() in lib/blocks/actions.tsx.
//
// Usage:
//   <LLMGrader question="Why is the sky blue?"
//              rubric="Full credit requires mentioning Rayleigh scattering.">
//     <TextArea />
//   </LLMGrader>
//
// Attributes:
//   question: The question being asked (context for the LLM)
//   rubric: Grading criteria
//   answer: Optional reference answer
//
import { z } from 'zod';
import { dev, grader } from '@/lib/blocks';
import { isEmptyInput } from '@/lib/blocks/createGrader';
import { correctness, type Correctness } from '@/lib/blocks/correctness';
import * as parsers from '@/lib/content/parsers';
import * as state from '@/lib/state';
import { callLLMSimple } from '@/lib/llm/reduxClient';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields(state.graderFields());

const VERDICTS = [correctness.correct, correctness.partiallyCorrect, correctness.incorrect] as const;

/** Extract the first JSON object from LLM output (models often wrap JSON in
 *  prose or code fences despite instructions). */
function parseVerdict(text: string): { verdict: Correctness; score?: number; feedback?: string } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!(VERDICTS as readonly string[]).includes(parsed.verdict)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildPrompt(props: RuntimeProps, input: string): string {
  return [
    'You are grading a student answer. Be fair and encouraging but accurate.',
    props.question && `Question: ${props.question}`,
    props.rubric && `Grading rubric: ${props.rubric}`,
    props.answer && `Reference answer: ${props.answer}`,
    `Student answer: ${input}`,
    'Respond with ONLY a JSON object, no other text:',
    '{"verdict": "correct" | "partiallyCorrect" | "incorrect", "score": <0..1>, "feedback": "<one or two sentences for the student>"}',
  ].filter(Boolean).join('\n');
}

async function gradeWithLLM(props: RuntimeProps, { input }: any) {
  // Empty input → unsubmitted (grader() doesn't check this for us).
  if (isEmptyInput(input)) {
    return { correct: correctness.unsubmitted, message: '' };
  }

  let text: string;
  try {
    text = await callLLMSimple(buildPrompt(props, String(input)));
  } catch (error: any) {
    // Network/server failure: invalid (not incorrect) — the learner's
    // answer was never judged, and submitCount doesn't increment.
    return { correct: correctness.invalid, message: `Grading failed: ${error.message}. Please try again.` };
  }

  const result = parseVerdict(text);
  if (!result) {
    return { correct: correctness.invalid, message: 'Grading failed: could not interpret the grader response. Please try again.' };
  }

  const score = typeof result.score === 'number'
    ? Math.max(0, Math.min(1, result.score))
    : (result.verdict === correctness.correct ? 1 : result.verdict === correctness.partiallyCorrect ? 0.5 : 0);
  return { correct: result.verdict, message: result.feedback ?? '', score };
}

const LLMGrader = dev({
  ...parsers.blocks.allowHTML(),
  ...grader({ asyncGrader: gradeWithLLM }),
  name: 'LLMGrader',
  fields,
  inputSchema: z.string(),
  description: 'Grades free-form answers with an LLM against a rubric (async grading with a pending state)',
  category: 'grading',
  // Non-conventional: reuses the shared layout Noop renderer.
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  attributes: z.object({
    question: z.string().optional().describe('The question being asked (context for the grader)'),
    rubric: z.string().optional().describe('Grading criteria the LLM applies'),
  }).strict(),
});

export default LLMGrader;
