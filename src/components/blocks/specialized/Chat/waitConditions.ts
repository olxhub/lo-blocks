// src/components/blocks/specialized/Chat/waitConditions.ts
//
// Wait condition evaluation using the state language.

import { useMemo } from 'react';
import {
  parse,
  extractStructuredRefs,
  mergeReferences,
  useReferences,
  evaluate,
  createContext,
  EMPTY_REFS
} from '@/lib/stateLanguage';
import type { References, ContextData } from '@/lib/stateLanguage';

/**
 * Chat script entry that might be a wait command.
 */
interface ChatEntry {
  type: string;
  expression?: string;
}

/**
 * Extract all references from wait commands in a chat script.
 */
export function extractWaitRefs(entries: ChatEntry[]): References {
  const expressions: string[] = [];

  for (const entry of entries) {
    if (entry.type === 'WaitCommand' && entry.expression) {
      expressions.push(entry.expression);
    }
  }

  if (expressions.length === 0) return EMPTY_REFS;
  return mergeReferences(...expressions.map(extractStructuredRefs));
}

/**
 * Check if we can advance past wait commands to the next content.
 *
 * Returns true if there's something useful to do (arrows to execute,
 * lines to show, satisfied waits to skip). Returns false only if
 * the first thing we'd encounter is an unsatisfied wait.
 *
 * Multiple consecutive waits act as AND - all must pass.
 */
export function canAdvanceToContent(
  entries: ChatEntry[],
  fromIndex: number,
  toIndex: number,
  context: ContextData
): boolean {
  let foundActionableEntry = false;

  for (let i = fromIndex + 1; i <= toIndex; i++) {
    const entry = entries[i];
    if (!entry) break;

    if (entry.type === 'WaitCommand') {
      if (!entry.expression) continue;
      try {
        if (!evaluate(parse(entry.expression), context)) {
          // Unsatisfied wait - can we do something before hitting it?
          return foundActionableEntry;
        }
      } catch (e) {
        console.warn('[Chat] Failed to evaluate wait:', entry.expression, e);
        return foundActionableEntry;
      }
      // Satisfied wait - counts as actionable (we skip past it)
      foundActionableEntry = true;
      continue;
    }

    // Arrows, section headers are actionable (we execute them)
    if (entry.type === 'ArrowCommand' || entry.type === 'SectionHeader') {
      foundActionableEntry = true;
      continue;
    }

    // Line or Pause - we can definitely advance to show this
    if (entry.type === 'Line' || entry.type === 'PauseCommand') {
      return true;
    }
  }

  return foundActionableEntry;
}

/**
 * Evaluate a single wait entry.
 */
export function evaluateWaitEntry(entry: ChatEntry, context: ContextData): boolean {
  if (!entry.expression) return true;
  try {
    return Boolean(evaluate(parse(entry.expression), context));
  } catch (e) {
    console.warn('[Chat] Failed to evaluate wait:', entry.expression, e);
    return false;
  }
}

/**
 * Hook for wait condition checking in a chat component.
 *
 * Returns:
 * - canAdvance: whether the immediate next wait (if any) is satisfied
 * - isWaitSatisfied: function to check a specific wait entry
 */
export function useWaitConditions(
  props: any,
  entries: ChatEntry[],
  currentIndex: number,
  endIndex: number
) {
  const allRefs = useMemo(() => extractWaitRefs(entries), [entries]);
  const resolved = useReferences(props, allRefs);
  const context = useMemo(() => createContext(resolved), [resolved]);

  // Check if we can advance (first wait before next content is satisfied)
  const canAdvance = canAdvanceToContent(entries, currentIndex, endIndex, context);

  // Function to evaluate a specific wait entry
  const isWaitSatisfied = (entry: ChatEntry) => evaluateWaitEntry(entry, context);

  return { canAdvance, isWaitSatisfied, context };
}
