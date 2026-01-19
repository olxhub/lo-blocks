import type { AppError } from '@/lib/errors';
import { appError } from '@/lib/errors';

/**
 * Fisher–Yates shuffle (in-place).
 */
export function fisherYatesShuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Arrange items with optional position selectors, with validation.
 *
 * Items can optionally have positions extracted via selector function.
 * Items with positions are placed at those slots (one-indexed).
 * Remaining items fill the gaps, optionally shuffled.
 *
 * Returns { arrangement } on success or { error } on failure.
 * Does not throw.
 */
export function buildArrangementWithPositions<T>(
  items: readonly T[],
  opts: {
    idSelector: (item: T) => string;
    positionSelector: (item: T) => number | undefined;
    shouldShuffleUnpositioned?: boolean;
  }
): { arrangement: T[] } | { error: AppError } {
  const n = items.length;
  const { idSelector, positionSelector, shouldShuffleUnpositioned = true } = opts;

  // Extract and validate positions
  const usedPositions = new Map<number, string>(); // position -> itemId

  for (const item of items) {
    const rawPos = positionSelector(item);
    if (rawPos === undefined) continue;

    const id = idSelector(item);

    if (typeof rawPos !== 'number' || !Number.isFinite(rawPos)) {
      return {
        error: appError(
          `Position for "${id}" must be a number between 1 and ${n}. You wrote: ${JSON.stringify(rawPos)}.`,
          { technical: { id, rawPos } }
        )
      };
    }

    if (!Number.isInteger(rawPos)) {
      return {
        error: appError(
          `Position for "${id}" must be a whole number. You wrote: ${rawPos}.`,
          { technical: { id, rawPos } }
        )
      };
    }

    if (rawPos < 1) {
      return {
        error: appError(
          `Position for "${id}" is ${rawPos}, but positions start at 1 (not 0). Use a number from 1 to ${n}.`,
          { technical: { id, rawPos } }
        )
      };
    }

    if (rawPos > n) {
      return {
        error: appError(
          `Position for "${id}" is ${rawPos}, but this question has ${n} items. Use a number from 1 to ${n}.`,
          { technical: { id, rawPos } }
        )
      };
    }

    const existingId = usedPositions.get(rawPos);
    if (existingId) {
      return {
        error: appError(
          `You put "${existingId}" and "${id}" in position ${rawPos}. Move one of them.`,
          { technical: { idA: existingId, idB: id, position: rawPos } }
        )
      };
    }

    usedPositions.set(rawPos, id);
  }

  // Build arrangement
  const result: Array<T | undefined> = new Array(n);
  const fixedIds = new Set<string>();

  // Place positioned items
  for (const item of items) {
    const rawPos = positionSelector(item);
    if (rawPos !== undefined) {
      const id = idSelector(item);
      result[rawPos - 1] = item;
      fixedIds.add(id);
    }
  }

  // Collect unpositioned items
  const unpositioned: T[] = [];
  for (const item of items) {
    const id = idSelector(item);
    if (!fixedIds.has(id)) unpositioned.push(item);
  }

  // Shuffle if requested
  if (shouldShuffleUnpositioned) {
    fisherYatesShuffleInPlace(unpositioned);
  }

  // Fill gaps
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (result[i] === undefined) {
      result[i] = unpositioned[k++];
    }
  }

  return { arrangement: result as T[] };
}
