// src/components/blocks/grading/CustomGrader.ts
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
//   <CustomGrader target="answer">
//     if (input === 42) return { correct: 'correct', message: 'Perfect!' };
//     if (Math.abs(input - 42) < 5) return { correct: 'partially-correct', message: 'Close!', score: 0.5 };
//     return { correct: 'incorrect', message: 'Try again' };
//   </CustomGrader>
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
// ============================================================================
// SECURITY MODEL
// ============================================================================
//
// CURRENT STATE: CustomGrader uses `new Function()` which executes code with
// access to the global scope. This is NOT sandboxed.
//
// THREAT MODEL:
// - OLX content is authored by course creators (instructors, TAs, content teams)
// - Unlike JSX, OLX is designed to be a safer declarative format
// - CustomGrader breaks this model by allowing arbitrary JS execution
// - A malicious or compromised course author could:
//   - In browser: Access localStorage, cookies, make fetch requests, exfiltrate data
//   - In Node.js: Access filesystem, environment variables, network, child_process
//
// WHY THIS MATTERS:
// - Multi-tenant LMS platforms host content from many authors
// - Server-side rendering/grading would expose the server to code injection
// - Course authors ≠ course facilitators:
//   - Author: Creates the course content (e.g., teacher at School A)
//   - Facilitator: Runs the course for students (e.g., teacher at School B using A's course)
//   - Facilitators need access to their students' data
//   - Authors should NOT have access to data from other institutions using their course
// - Threat vectors include:
//   - Compromised author computers
//   - Student-contributed content
//   - Large K-12 deployments with many teachers (large attack surface)
//
// CURRENT MITIGATION:
// - CustomGrader is DISABLED in Node.js environments (throws exception)
// - Browser execution is permitted but not sandboxed (defense in depth needed)
//
// FUTURE SOLUTIONS (in order of implementation complexity):
//
// 1. Web Workers (browser only)
//    - Run code in isolated thread, no DOM/global access
//    - Can terminate on timeout
//    - Async communication via postMessage
//    - Limitation: Browser-only, doesn't help server-side
//
// 2. SES/Lockdown (Agoric's Secure ECMAScript)
//    - Hardens JavaScript by freezing primordials
//    - Same-thread execution with controlled globals
//    - Works in both browser and Node.js
//    - npm: ses, @agoric/lockdown
//
// 3. isolated-vm (Node.js)
//    - Uses V8 isolates for true memory isolation
//    - Used by Cloudflare Workers
//    - Strong isolation with timeout/memory limits
//    - npm: isolated-vm
//
// 4. QuickJS in WebAssembly (cross-platform)
//    - Run a complete JS interpreter compiled to WASM
//    - Total isolation - separate memory space
//    - Works everywhere WASM runs
//    - Heavy (~500KB), but bulletproof
//    - npm: quickjs-emscripten
//
// 5. Container/subprocess (server-side)
//    - Run graders in isolated Docker containers
//    - Or separate Node process with restricted permissions
//    - Heaviest but most battle-tested for untrusted code
//
// RECOMMENDATION:
// For production multi-tenant use, implement option 2 (SES) for immediate
// protection, then option 3 or 4 for stronger isolation. The current
// `new Function()` approach should only be used in trusted single-tenant
// deployments where course authors are fully trusted.
//
// ============================================================================
//
import { z } from 'zod';
import { createGrader } from '@/lib/blocks';
import { CORRECTNESS } from '@/lib/blocks/correctness';
import _Hidden from '@/components/blocks/layout/_Hidden';

/**
 * Security error message explaining why CustomGrader is disabled server-side.
 * This is a const so it can be referenced in both the exception and tests.
 */
export const CUSTOM_GRADER_SECURITY_ERROR = `
CustomGrader is disabled in Node.js environments for security reasons.

CustomGrader executes arbitrary JavaScript code provided by course authors using
\`new Function()\`, which has access to the global scope. In a Node.js environment,
this would allow malicious code to:
- Access the filesystem (fs module)
- Read environment variables (process.env)
- Make network requests
- Execute system commands (child_process)
- Access any server-side secrets or databases

SOLUTIONS:

1. Run grading client-side only (current behavior)
   - CustomGrader works in browsers where damage is limited to the user's session

2. Implement sandboxed execution (future work)
   - SES/Lockdown for same-thread hardened JS
   - isolated-vm for V8 isolate-based isolation
   - QuickJS in WebAssembly for complete isolation
   - Container-based execution for strongest guarantees

3. Use declarative graders instead
   - StringGrader, NumericalGrader, RulesGrader for most cases
   - These are safe because they don't execute arbitrary code

See the SECURITY MODEL section in CustomGrader.ts for detailed documentation.
`.trim();

/**
 * Check if we're in a safe environment for code execution.
 * Returns true only if we're confident we're in a browser context.
 */
function isSafeExecutionEnvironment(): boolean {
  // Not in browser; may be faked with jsdom or similar polyfills
  if (typeof window === 'undefined') {
    return false;
  }

  // In Node.js; return false. May fail to flag oddball environments like Deno/Bun.
  if (typeof process !== 'undefined' && process.versions?.node != null) {
    return false;
  }

  // Not in Node AND in browser
  return true;
}

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
 * This assumes that authors have the same trust level as the OLX
 * content itself.
 */
function executeGradingCode(
  code: string,
  context: { input: unknown; inputs: unknown[] }
): { correct: string; message: string; score?: number } {
  // Security check: Only execute in safe (browser) environments
  if (!isSafeExecutionEnvironment()) {
    throw new Error(CUSTOM_GRADER_SECURITY_ERROR);
  }

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
    console.error('[CustomGrader] Execution error:', error);
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
  // Note: For multi-input graders, `input` is undefined - only `inputs` is set
  const firstInput = input ?? inputs?.[0];
  if (firstInput === undefined || firstInput === null || firstInput === '') {
    return {
      correct: CORRECTNESS.UNSUBMITTED,
      message: '',
    };
  }

  return executeGradingCode(code, { input, inputs: inputs ?? [input] });
}

const CustomGrader = createGrader({
  base: 'Custom',
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

export default CustomGrader;
