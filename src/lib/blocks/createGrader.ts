// src/lib/blocks/createGrader.ts
//
// Factory function for creating grader blocks with minimal boilerplate.
//
// When you call createGrader({ base: 'String', ... }), it creates TWO blocks:
// - StringGrader: A full grader block that connects to inputs
// - StringMatch: A matching rule for use inside RulesGrader
//
// Match functions are **pure boolean predicates**. The framework handles the
// state machine:
//   - Empty input → UNSUBMITTED
//   - validateInputs fails → INVALID
//   - match returns true → CORRECT
//   - match returns false → INCORRECT
//
// Usage:
//   export default createGrader({
//     base: 'String',
//     description: 'Grades text answers',
//     match: stringMatch,  // Pure predicate returning boolean
//     inputSchema: z.string(),  // Declares single string input
//     attributes: {
//       answer: z.string({ required_error: 'answer is required' }),
//       regexp: strictBoolean,
//       ignoreCase: strictBoolean,
//     },
//   });
//
// The `match` function is automatically registered in the state language DSL,
// enabling expressions like: stringMatch(@answer.value, 'Paris', { ignoreCase: true })
//
import React from 'react';
import { z } from 'zod';
import { core } from './namespaces';
import * as parsers from '@/lib/content/parsers';
import { grader, type GraderParams, type SingleParam, type ListParam, type DictParam } from './actions';
import { graderAttributes, baseAttributes } from './attributeSchemas';
import _Noop from '@/components/blocks/layout/_Noop';
import { registerDSLFunction } from '@/lib/stateLanguage/functions';
import { correctness } from './correctness';
import type { RuntimeProps, LocalsAPI } from '@/lib/types';

// Registry of Match blocks created by createGrader
// blockRegistry.ts will merge these in
export const MATCH_BLOCKS: Record<string, any> = {};

// Shared attributes for rules (score, feedback, feedbackBlock)
const RULE_ATTRIBUTES = {
  score: z.coerce.number().min(0).max(1).optional(),
  feedback: z.string().optional(),
  feedbackBlock: z.string().optional(),
};

/**
 * Check if an input is empty/unsubmitted.
 */
function isEmptyInput(input: any): boolean {
  if (input === undefined || input === null) return true;
  if (typeof input === 'string' && input.trim() === '') return true;
  return false;
}

/**
 * Check if any inputs in an array are empty/unsubmitted.
 */
function hasEmptyInputs(inputs: any[]): boolean {
  return inputs.some(isEmptyInput);
}

// Type for boolean match functions
export type MatchFunction = (input: any, pattern: any, options?: Record<string, any>) => boolean;

/**
 * Create a grader function from a boolean match function with state machine.
 *
 * The state machine handles:
 * - Empty input → UNSUBMITTED
 * - validateInputs fails → INVALID
 * - match returns true → CORRECT
 * - match returns false → INCORRECT
 */
function graderFromMatch(
  matchFn: MatchFunction,
  config: {
    validateInputs?: (input: any, attrs: Record<string, any>) => string[] | undefined;
    slots?: string[];
    inputType?: 'single' | 'list';
  }
): (props: RuntimeProps, params: GraderParams) => { correct: string; message: string } {
  // Determine param mode: dict (if slots), list (if explicit), or single (default)
  const paramMode = config.slots ? 'dict' : (config.inputType === 'list' ? 'list' : 'single');

  return (props, params) => {
    // Extract options from props (everything except answer and standard grader attrs)
    const { answer, target, displayAnswer, ...options } = props;

    // Get the input based on param mode
    let input: any;
    if (paramMode === 'dict') {
      input = (params as DictParam).inputDict;
    } else if (paramMode === 'single') {
      input = (params as SingleParam).input;
    } else {
      input = (params as ListParam).inputList;
    }

    // Step 1: Check for empty input → UNSUBMITTED
    if (paramMode === 'dict') {
      // For dict, check if any slot value is empty
      const values = Object.values(input as Record<string, any>);
      if (values.length === 0 || values.some(isEmptyInput)) {
        return { correct: correctness.unsubmitted, message: '' };
      }
    } else if (paramMode === 'list') {
      if (!Array.isArray(input) || input.length === 0 || hasEmptyInputs(input)) {
        return { correct: correctness.unsubmitted, message: '' };
      }
    } else {
      if (isEmptyInput(input)) {
        return { correct: correctness.unsubmitted, message: '' };
      }
    }

    // Step 2: Validate input if validator provided → INVALID on failure
    if (config.validateInputs) {
      const errors = config.validateInputs(input, props);
      if (errors && errors.length > 0) {
        return { correct: correctness.invalid, message: errors[0] };
      }
    }

    // Step 3: Call match function → CORRECT or INCORRECT
    try {
      const matched = matchFn(input, answer, options);
      return {
        correct: matched ? correctness.correct : correctness.incorrect,
        message: '',
      };
    } catch (e) {
      // Match function threw - treat as invalid
      return {
        correct: correctness.invalid,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  };
}

/**
 * Answer display mode for graders.
 * - 'per-input': Show answer next to each input (default for single-input graders)
 * - 'summary': Show answer once after all inputs (for multi-input like RatioGrader)
 * - 'custom': Grader renders its own answer display (MCQ highlights, Sortable overlays)
 * - 'none': No answer to show (RulesGrader, LLMGrader with rubrics)
 */
export type AnswerDisplayMode = 'per-input' | 'summary' | 'custom' | 'none';

interface CreateGraderConfig {
  base: string;
  description: string;
  /**
   * Pure boolean match function.
   *
   * When provided:
   * - Registered in the DSL as `${base.toLowerCase()}Match` (e.g., 'stringMatch')
   * - Used by RulesGrader's Match block for predicate matching
   * - Auto-generates the grader function with state machine
   *
   * The function signature: (input, pattern, options?) => boolean
   */
  match?: MatchFunction;
  /**
   * Custom grader function. If match is provided and grader is not, the grader
   * is auto-generated from match. Required if match is not provided.
   */
  grader?: (props: RuntimeProps, params: GraderParams) => { correct: any; message: any };
  /**
   * Zod schema for the input(s) this grader expects. Required when using match.
   *
   * Single input: z.string(), z.number(), etc.
   * Multi-input: z.tuple([z.string(), z.string()]) or z.array(z.string())
   *
   * The schema determines:
   * - Whether to pass input (single) or inputs (array) to match/grader
   * - Input validation for error messages
   * - Documentation generation
   * - Editor UI hints
   */
  inputSchema?: z.ZodType;
  /**
   * Named slots for multi-input graders.
   *
   * When provided, the framework resolves inputs to slots and passes an
   * inputDict to the grader. This enables semantic access like
   * `{ numerator, denominator }` instead of positional arrays.
   *
   * Resolution priority:
   * 1. Explicit `slot="numerator"` attribute on input
   * 2. Positional: first input → first slot, second → second slot
   *
   * Example:
   *   slots: ['numerator', 'denominator']
   *
   * The grader then receives:
   *   { inputDict: { numerator: '2', denominator: '1' }, inputApiDict: {...} }
   */
  slots?: string[];
  /**
   * Input type for graders without named slots.
   * - 'single': Expects exactly one input → receives { input, inputApi }
   * - 'list': Expects zero or more inputs → receives { inputList, inputApis }
   *
   * If slots is provided, inputType is ignored (dict mode is used).
   */
  inputType?: 'single' | 'list';
  attributes?: Record<string, any>;
  /**
   * Semantic validation for the answer/pattern at parse time.
   * Called after Zod parsing succeeds. Returns array of error messages or empty/undefined if valid.
   * Use for domain-specific validation like:
   * - answer must be a valid number/range
   * - regexp pattern must be valid
   * - tolerance must be a valid number or percentage
   */
  validateAttributes?: (attrs: Record<string, any>) => string[] | undefined;
  /**
   * Validate student input at runtime. Called before match function.
   * Returns array of error messages (→ INVALID) or empty/undefined (→ proceed to match).
   *
   * Use for validating input format, e.g.:
   * - Input must be a valid number
   * - Denominator cannot be zero
   */
  validateInputs?: (input: any, attrs: Record<string, any>) => string[] | undefined;
  /**
   * How to display the answer when "Show Answer" is clicked.
   * - 'per-input': Show next to each input (default)
   * - 'summary': Show once after all inputs
   * - 'custom': Grader handles display (e.g., MCQ highlights choices)
   * - 'none': No answer to show
   */
  answerDisplayMode?: AnswerDisplayMode;
  /**
   * Get a single display answer (for 'per-input' with single input, or 'summary' mode).
   * Default: returns props.displayAnswer ?? props.answer
   */
  getDisplayAnswer?: (props: RuntimeProps) => any;
  /**
   * Get display answers per slot (for 'per-input' with multi-input graders).
   * Returns { slot: displayValue } where slot matches the `slots` declaration.
   * When provided and mode is 'per-input', each input shows its slot's answer.
   */
  getDisplayAnswers?: (props: RuntimeProps) => Record<string, any>;
  locals?: LocalsAPI;
  /** If false, don't infer inputs from children (use explicit target). Default: true */
  infer?: boolean;
  /** If false, don't create a Match block variant. Default: true */
  createMatch?: boolean;
  /** Custom component to render. Default: _Noop (renders children). Use _Hidden to hide children. */
  component?: React.ComponentType<any>;
  /** Custom parser for children. Default: parsers.blocks.allowHTML(). Use parsers.text() for code content. */
  parser?: { parser: (ctx: any) => Promise<any>; staticKids?: (entry: any) => any[] };
}

export function createGrader({
  base,
  description,
  match: matchFn,
  grader: customGraderFn,
  inputSchema,
  slots,
  inputType,
  attributes = {},
  validateAttributes,
  validateInputs,
  answerDisplayMode,
  getDisplayAnswer,
  getDisplayAnswers,
  locals,
  infer = true,
  createMatch = true,
  component = _Noop,
  parser,
}: CreateGraderConfig) {
  const graderName = `${base}Grader`;
  const matchName = `${base}Match`;

  // Register a DSL wrapper that returns boolean for use in conditions
  // e.g., stringMatch(@answer.value, "Paris") returns true/false
  if (matchFn) {
    const dslFunctionName = `${base.charAt(0).toLowerCase()}${base.slice(1)}Match`;
    registerDSLFunction(dslFunctionName, matchFn);
  }

  // Auto-generate grader from match function, or use custom grader if provided
  let graderFn: ((props: RuntimeProps, params: GraderParams) => { correct: any; message: any }) | undefined;

  if (customGraderFn) {
    graderFn = customGraderFn;
  } else if (matchFn) {
    graderFn = graderFromMatch(matchFn, { validateInputs, slots, inputType });
  }

  if (!graderFn) {
    throw new Error(`createGrader(${base}): Either match or grader must be provided`);
  }

  // Determine default answer display mode based on input configuration
  const effectiveAnswerDisplayMode = answerDisplayMode ?? (slots ? 'summary' : 'per-input');

  // Create the full Grader block (connects to inputs, grades them)
  const graderBlock = core({
    ...(parser ?? parsers.blocks.allowHTML()),
    ...grader({ grader: graderFn, infer, slots, inputType }),
    name: graderName,
    description,
    category: 'grading',
    component,
    attributes: graderAttributes.extend(attributes),
    validateAttributes,
    answerDisplayMode: effectiveAnswerDisplayMode,
    getDisplayAnswer: getDisplayAnswer ?? ((props: RuntimeProps) => props.displayAnswer ?? props.answer),
    getDisplayAnswers,
  }, locals);

  // Create the Match block (a rule for use inside RulesGrader)
  // Match blocks don't connect to inputs - they just define matching logic
  if (createMatch) {
    const matchBlock = core({
      ...parsers.blocks(),
      name: matchName,
      description: `Matching rule for ${base} patterns, used inside RulesGrader`,
      category: 'grading',
      component: _Noop,
      internal: true,
      isMatch: true,
      attributes: baseAttributes.extend({
        ...RULE_ATTRIBUTES,
        ...attributes,
      }).strict(),
      locals: {
        match: graderFn,
        ...(locals || {}),
      },
    });

    MATCH_BLOCKS[matchName] = matchBlock;
  }

  return graderBlock;
}

export default createGrader;
