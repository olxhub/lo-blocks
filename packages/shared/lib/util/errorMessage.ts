// packages/shared/lib/util/errorMessage.ts

/**
 * Human-readable message from a caught value. `catch` binds `unknown`
 * (errors are a trust boundary); this is the one place that unpacks it.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
