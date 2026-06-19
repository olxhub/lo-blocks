// packages/shared/lib/types/errors.ts

/**
 * ═══════════
 * ERROR TYPES
 * ═══════════
 * Unified error handling for the codebase.
 *
 * As a guideline, in error handling, all else being equal, error
 * objects preferred for expected errors, and exceptions for
 * unexpected failures. Code shouldn't contort to that, however.
 *
 * AppError is the canonical error value type. It can be:
 * - Returned from functions as { ..., error?: AppError }
 * - Spread directly into DisplayError: <DisplayError {...error} />
 * - Used in hooks as { data, loading, error?: AppError }
 * - Passed as ErrorNode attributes (the block reads AppError fields)
 *
 * Error type hierarchy:
 *
 *   AppError                  — Base error value type (lib/errors.ts)
 *     └─ OLXLoadingError      — Content loading/parsing errors (adds type, source location)
 *
 * AppError is the canonical error shape. It aligns with DisplayError props
 * so you can spread one into the other: <DisplayError {...error} />.
 *
 * OLXLoadingError extends AppError with content-pipeline-specific fields
 * (error type tag and OLX source location).
 *
 * ErrorNode (the block) receives AppError fields as attributes and passes through to
 * DisplayError. It doesn't need to know which subtype it has.
 */



//
// Future directions:
// - All error producers should create AppError (or subtypes). No ad-hoc
//   error shapes — if you need extra fields, extend AppError.
// - The error panel (OLXLoadingError[]) could accept AppError[] and use
//   type narrowing for subtype-specific columns.
// - Consider whether AppError.technical should be typed more narrowly
//   (e.g. string | Record<string, unknown>) rather than `any`.
//


import { z } from 'zod';
import type { LofsDependencies } from './core';
import { safeStringify } from '@/lib/util';

// TODO(type-system-audit/lofs): replace this with a real z_lofsCanonical
// schema once LOFS address types are refactored. This currently validates
// only the serialized representation, not the LofsCanonical brand or address
// structure.
const z_lofsDependencies = z.array(z.string()) as unknown as z.ZodType<LofsDependencies>;
const z_olxLoadingErrorType = z.enum([
  'parse_error',
  'duplicate_id',
  'source_collision',
  'file_error',
  'peg_error',
  'attribute_validation',
  'metadata_error',
]);

/**
 * Standard error shape used throughout the codebase.
 *
 * Aligns with DisplayError props so you can spread directly:
 *   <DisplayError {...error} />
 */
export const z_appError = z.object({
  title: z.string().optional(),
  message: z.string(),
  technical: z.any().optional(),
  stack: z.string().optional(),
}).strict();

export type AppError = z.infer<typeof z_appError>;

/**
 * Convert any thrown value into the canonical {@link AppError}.
 *
 * Use this at the ONE boundary where a native Error (or unknown throw) enters
 * the app. After that, AppError flows by spread — `<DisplayError {...error} />`,
 * `setRenderError(appError)` — with no per-field copying and no scattered `?.`.
 *
 * A native Error's `message`/`stack` are non-enumerable, so a plain `{...err}`
 * silently loses them; that's exactly the class of bug this avoids by
 * extracting them explicitly here, in one place.
 */
export function toAppError(err: unknown, overrides: Partial<AppError> = {}): AppError {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, ...overrides };
  }
  if (typeof err === 'object' && err !== null) {
    // Already an AppError-shaped value (e.g. a restored one) — carry it through.
    // Guarantee a message: a plain object throw (e.g. `{ code: 500 }`) has none,
    // which violates z_appError and renders a blank DisplayError.
    const o = err as Partial<AppError>;
    return { ...(o as AppError), message: o.message ?? safeStringify(err), ...overrides };
  }
  return { message: String(err), ...overrides };
}

export const z_olxSourceLocation = z.object({
  provenance: z_lofsDependencies.optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  offset: z.number().optional(),
}).strict();

export type OLXSourceLocation = {
  /**
   * Sources this error can be traced to. Producers should narrow to
   * the source(s) that actually contain the problem; passing the
   * current full set is an acceptable default. URIs (not paths) so
   * file://, memory://, git://, postgres://, etc. work uniformly.
   * See the file header comment for the full contract.
   */
  provenance?: LofsDependencies;

  // TODO: These should map to which file. "Primary source" is ambiguous.
  /** Line within the error's primary source (may be absent). */
  line?: number;
  /** Column within the error's primary source (may be absent). */
  column?: number;
  /** Byte offset within the error's primary source (may be absent). */
  offset?: number;
};

// Block schemas already get `title` from baseAttributes.
export const z_appErrorAttributes = z_appError.omit({ title: true });

export const z_olxLoadingError = z_appError.extend({
  title: z.string(),
  type: z_olxLoadingErrorType,
  location: z_olxSourceLocation,
}).strict();

export const z_errorNodeAttributes = z_appErrorAttributes.extend({
  type: z_olxLoadingErrorType.optional(),
  location: z_olxSourceLocation.optional(),
}).strict();

// OLX Content Loading Errors
// - `location.provenance` is LofsDependencies (LofsCanonical[]) — the sources
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

export type OLXLoadingError = z.infer<typeof z_olxLoadingError>;
