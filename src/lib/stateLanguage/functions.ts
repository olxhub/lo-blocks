// src/lib/stateLanguage/functions.ts
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

import { wordcount } from './evaluate';

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
