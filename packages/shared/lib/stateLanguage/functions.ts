// packages/shared/lib/stateLanguage/functions.ts
//
// Registry for functions available in the state language DSL.
//
// Functions registered here can be called in expressions like:
//   stringMatch(@answer.value, 'Paris', { ignoreCase: true })
//   numericalMatch(@value, 42, { tolerance: 0.1 })
//
// The registry is populated:
// - Manually for built-in functions (wordcount, etc.)
// - Automatically by createGrader for match functions
//

import { wordcount, text2markdown, isFilled } from './evaluate';
import { formatDuration } from '@/lib/util/duration';
import { qualifyDefinitionRef, parseAnyDefinitionRef } from '@/lib/types/id-grammar';
import type { ContentNamespace } from '@/lib/types/id-grammar';

/**
 * Registry of functions available in DSL expressions.
 * Keys are function names, values are the actual functions.
 *
 * Match functions (stringMatch, numericalMatch, etc.) are registered dynamically
 * when their grader modules load, to avoid circular import issues.
 */
export const dslFunctions: Record<string, Function> = {
  // Built-in helpers
  wordcount,
  text2markdown,
  isFilled,
  formatDuration,
};

/**
 * Register a function in the DSL.
 *
 * @param name - The name to use in expressions (e.g., 'stringMatch')
 * @param fn - The function to register
 * @throws If a function with this name is already registered
 */
export function registerDSLFunction(name: string, fn: Function): void {
  if (name in dslFunctions) {
    // Allow re-registration of the same function (module hot reload)
    if (dslFunctions[name] === fn) return;
    console.warn(`[stateLanguage] Overwriting DSL function: ${name}`);
  }
  dslFunctions[name] = fn;
}

/**
 * Get a function from the registry.
 *
 * @param name - The function name
 * @returns The function, or undefined if not registered
 */
export function getDSLFunction(name: string): Function | undefined {
  return dslFunctions[name];
}

/**
 * Check if a function is registered.
 *
 * @param name - The function name
 * @returns true if registered
 */
export function hasDSLFunction(name: string): boolean {
  return name in dslFunctions;
}

/**
 * Get all registered function names.
 * Useful for documentation and debugging.
 */
export function getDSLFunctionNames(): string[] {
  return Object.keys(dslFunctions);
}

// ============================================
// Context-aware functions
// ============================================
//
// Ordinary DSL functions see only their evaluated arguments. A few helpers
// need the *evaluation context* as well — chiefly the host block's content
// namespace, so they can qualify author-written refs.
//
// A context-aware function is registered as a FACTORY: given the context, it
// returns the callable. evaluateIdentifier() consults this registry before
// dslFunctions, so `DefinitionKey(...)` resolves to a namespace-bound closure
// at evaluation time.
//
// (`id()` predates this registry and is still bound by createContext; it does
// the same thing by hand. New context-aware helpers — a future StateKey(x),
// say — should register here instead.)

/** A context-aware function: a factory that binds itself to the evaluation context. */
export type ContextFunctionFactory = (context: { ns?: ContentNamespace }) => Function;

export const contextFunctions: Record<string, ContextFunctionFactory> = {};

/** Register a context-aware function under `name`. */
export function registerContextFunction(name: string, factory: ContextFunctionFactory): void {
  if (name in contextFunctions && contextFunctions[name] !== factory) {
    console.warn(`[stateLanguage] Overwriting context-aware DSL function: ${name}`);
  }
  contextFunctions[name] = factory;
}

/**
 * DefinitionKey(x) — normalize a definition ref to its canonical qualified form.
 *
 * Namespace-qualified DefinitionKeys are the canonical way to name a piece of
 * content. But values that FLOW THROUGH STATE are plain strings, and different
 * writers produce different shapes: a `::screen [display=target:sidebar]`
 * embed writes the qualified key ("edu.memphis.writing.sba/tut_welcome"),
 * while authors write the bare name in comparisons ('tut_welcome'). Equality
 * in the state language is string equality — it cannot know a field holds a
 * ref — so the normalization has to be explicit and cheap:
 *
 *   DefinitionKey(@tut_sidebar.value) === DefinitionKey('tut_welcome')
 *
 * Both sides go through the SAME qualify helper the write side uses
 * (qualifyDefinitionRef), so bare and qualified forms compare equal.
 *
 * Behavior:
 *   - bare ref        → qualified against the evaluation namespace
 *   - qualified ref   → unchanged (qualifyRef passes namespaced refs through)
 *   - null/undefined/'' → returned as-is, so DefinitionKey(@x.value) on an
 *     unset field is falsy rather than an exception
 *   - no `ns` in context → returned unchanged. Render paths always supply one
 *     (selectReferences passes props.runtime.ns); contexts without a namespace
 *     are hand-built ones (tests, tools). Throwing there would silently break
 *     every Trigger in a page; degrading to the raw string reproduces the old,
 *     unnormalized comparison instead.
 *   - unparseable as a ref → returned unchanged, for the same reason.
 */
function makeDefinitionKeyHelper(ns?: ContentNamespace) {
  return (ref: unknown): unknown => {
    if (ref == null || ref === '') return ref;
    if (typeof ref !== 'string') {
      throw new Error(`DefinitionKey() needs a ref string, got ${JSON.stringify(ref)}`);
    }
    if (!ns) return ref;
    try {
      // Permissive parse: this is a RUNTIME boundary, and target values can
      // carry system-generated ("_"-prefixed) refs that the authoring-side
      // parseDefinitionRef rejects.
      return qualifyDefinitionRef(parseAnyDefinitionRef(ref), ns);
    } catch {
      return ref;
    }
  };
}

registerContextFunction('DefinitionKey', (context) => makeDefinitionKeyHelper(context.ns));
