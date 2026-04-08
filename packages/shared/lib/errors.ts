// src/lib/errors.ts
//
// Unified error handling for the codebase.
//
// AppError is the canonical error value type. It can be:
// - Returned from functions as { ..., error?: AppError }
// - Spread directly into DisplayError: <DisplayError {...error} />
// - Used in hooks as { data, loading, error?: AppError }
// - Passed as ErrorNode kids (the block reads AppError fields)
//
// Design principles:
// - Flat returns, not layered (no { ok, data } wrappers)
// - Error objects preferred, but exceptions are fine for unexpected failures
// - message is always user-friendly; technical details go in technical/stack
// - Subtypes extend AppError (e.g. OLXLoadingError adds type/summary)
//
// Type hierarchy:
//   AppError                — base, works everywhere
//     └─ OLXLoadingError    — content pipeline errors (types.ts)
//
// Location tracking:
// - `location.provenance` is a ProvenanceURI[] — the set of sources the
//   error can be traced to. It is an array (not a single URI) because an
//   error may involve several related sources (an XML that references a
//   PEG file, an asset loaded by a fragment, etc.) and the producer may
//   not always be able to pin the error to one of them. It is URIs
//   rather than file paths because sources can be file://, memory://,
//   git://, postgres://, and so on.
//
//   Producers SHOULD narrow this to the source(s) that actually contain
//   the problem (XML parse failure → the .olx; PEG failure → the
//   .chatpeg); passing the whole current chain is an acceptable default
//   when the producer can't narrow it.
//
// - `location.{line, column, offset}` identify a position within the
//   error's primary source. Producers that attach them should have
//   narrowed `provenance` to that source. They may be absent even when
//   provenance is set (e.g. the underlying parser doesn't track them).
//
// Future directions:
// - All error producers should create AppError (or subtypes). No ad-hoc
//   error shapes — if you need extra fields, extend AppError.
// - DisplayError should gain location awareness (render provenance/line/col
//   from AppError.location) so callers don't need to format it.
// - The error panel (OLXLoadingError[]) could accept AppError[] and use
//   type narrowing for subtype-specific columns.
// - Consider whether AppError.technical should be typed more narrowly
//   (e.g. string | Record<string, unknown>) rather than `any`.
//

import type { ProvenanceURI } from '@/lib/types';

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

  /** Location of the error within its source(s) (for parser/content errors) */
  location?: {
    /**
     * Sources this error can be traced to. Producers should narrow to
     * the source(s) that actually contain the problem; passing the
     * current full set is an acceptable default. URIs (not paths) so
     * file://, memory://, git://, postgres://, etc. work uniformly.
     * See the file header comment for the full contract.
     */
    provenance?: ProvenanceURI[];
    /** Line within the error's primary source (may be absent). */
    line?: number;
    /** Column within the error's primary source (may be absent). */
    column?: number;
    /** Byte offset within the error's primary source (may be absent). */
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
