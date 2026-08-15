/**
 * Call every callback, then rethrow the first failure.
 *
 * Event delivery is cleanup in a collaborative editor: one broken view must
 * not prevent another view—or the network provider—from seeing the change.
 */
export const callAll = (callbacks: Iterable<() => void>): void => {
  const errors: unknown[] = []
  for (const callback of callbacks) captureError(errors, callback)
  throwFirst(errors)
}

/** Run one cleanup step without preventing later cleanup steps. */
export const captureError = (
  errors: unknown[],
  callback: () => void
): void => {
  try {
    callback()
  } catch (error) {
    errors.push(error)
  }
}

export const throwFirst = (errors: readonly unknown[]): void => {
  if (errors.length > 0) throw errors[0]
}
