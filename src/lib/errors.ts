// src/lib/errors.ts
//
// Unified error handling for the codebase.
//
// This module provides a consistent error shape (AppError) that can be:
// - Returned from functions as { ..., error?: AppError }
// - Spread directly into DisplayError: <DisplayError {...error} />
// - Used in hooks as { data, loading, error?: AppError }
//
// Design principles:
// - Flat returns, not layered (no { ok, data } wrappers)
// - Error objects preferred, but exceptions are fine for unexpected failures
// - message is always user-friendly; technical details go in technical/stack
//

/**
 * Standard error shape used throughout the codebase.
 *
 * Aligns with DisplayError props so you can spread directly:
 *   <DisplayError {...error} />
 */
export interface AppError {
  /** User-friendly error message (required) */
  message: string;

  /** Technical details for developers (original error, debug info) */
  technical?: any;

  /** Stack trace when relevant */
  stack?: string;

  /** Location in source file (for parser/content errors) */
  location?: {
    file?: string;
    line?: number;
    column?: number;
    offset?: number;
  };
}

/**
 * Convert an exception to AppError.
 *
 * @param e - The caught exception (Error or unknown)
 * @param context - Optional context prefix for the message
 * @returns AppError with message, technical info, and stack
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (e) {
 *   return { error: fromException(e, 'Failed to load content') };
 * }
 */
export const fromException = (e: unknown, context?: string): AppError => ({
  message: context ? `${context}: ${errorMessage(e)}` : errorMessage(e),
  technical: e instanceof Error ? e.name : undefined,
  stack: e instanceof Error ? e.stack : undefined,
});

/**
 * Extract a message string from any error type.
 *
 * @param e - Error, string, or unknown value
 * @returns Human-readable error message
 */
export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * Check if a result object has an error.
 *
 * @param result - Object that may have an error property
 * @returns true if error is present and defined
 *
 * @example
 * const result = await loadContent();
 * if (hasError(result)) {
 *   console.error(result.error.message);
 * }
 */
export const hasError = <T extends { error?: AppError }>(result: T): result is T & { error: AppError } =>
  result.error !== undefined;

/**
 * Create an AppError from a message string.
 *
 * @param message - User-friendly error message
 * @param opts - Optional additional fields (technical, stack, location)
 * @returns AppError object
 *
 * @example
 * return { error: appError('File not found', { technical: { path } }) };
 */
export const appError = (message: string, opts?: Partial<Omit<AppError, 'message'>>): AppError => ({
  message,
  ...opts,
});
