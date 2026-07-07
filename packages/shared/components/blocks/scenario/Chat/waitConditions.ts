// packages/shared/components/blocks/scenario/Chat/waitConditions.ts
//
// Wait condition evaluation using the state language.

import { useCallback, useMemo } from 'react';
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
import type { ConversationEntry, WaitCommand, LlmCommand } from './_chatTypes';

/** The shape of interlude log items this module needs (see llmInterlude.ts). */
interface InterludeItemish {
  atIndex: number;
  control?: string;
  message: { type: string; speaker?: string };
}

/**
 * May the script advance PAST an LLM interlude?
 *   - `until` satisfied (when present; free otherwise), OR
 *   - the agent called end_conversation (durable exit marker in the log), OR
 *   - maxTurns is exhausted (a hard stop must never strand the user
 *     behind an unsatisfied until).
 */
export function interludeExitAllowed(
  entry: LlmCommand,
  context: ContextData,
  items: InterludeItemish[],
  atIndex: number,
): boolean {
  const mine = items.filter(it => it.atIndex === atIndex);
  if (mine.some(it => it.control === 'exit')) return true;
  const maxTurns = entry.metadata.maxTurns ? parseInt(entry.metadata.maxTurns, 10) : null;
  if (maxTurns !== null) {
    const turns = mine.filter(it => it.message.type === 'Line' && it.message.speaker === 'You').length;
    if (turns >= maxTurns) return true;
  }
  return llmExitSatisfied(entry, context);
}

/**
 * May the script advance PAST an LLM interlude? Gated by its `until`
 * expression when present; free otherwise (Continue ends the interlude).
 */
export function llmExitSatisfied(entry: LlmCommand, context: ContextData): boolean {
  const until = entry.metadata.until;
  if (!until) return true;
  try {
    return Boolean(evaluate(parse(until), context));
  } catch (e) {
    console.warn('[Chat] Failed to evaluate llm until:', until, e);
    return false;
  }
}

/**
 * Extract all references from wait commands in a chat script.
 */
export function extractWaitRefs(entries: ConversationEntry[]): References {
  const expressions: string[] = [];

  for (const entry of entries) {
    if (entry.type === 'WaitCommand' && entry.expression) {
      expressions.push(entry.expression);
    }
    if (entry.type === 'LlmCommand' && entry.metadata.until) {
      expressions.push(entry.metadata.until);
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
  entries: ConversationEntry[],
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

    // Set commands, section headers are actionable (we execute them)
    if (entry.type === 'SetField' || entry.type === 'SectionHeader') {
      foundActionableEntry = true;
      continue;
    }

    // Line, Pause, Embed, or LLM interlude - we can definitely advance to show this
    if (entry.type === 'Line' || entry.type === 'PauseCommand' || entry.type === 'EmbedCommand'
        || entry.type === 'LlmCommand') {
      return true;
    }
  }

  return foundActionableEntry;
}

/**
 * Evaluate a single wait entry.
 */
export function evaluateWaitEntry(entry: WaitCommand, context: ContextData): boolean {
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
  entries: ConversationEntry[],
  currentIndex: number,
  endIndex: number
) {
  const allRefs = useMemo(() => extractWaitRefs(entries), [entries]);
  const resolved = useReferences(props, allRefs);
  const context = useMemo(() => createContext(resolved), [resolved]);

  // Check if we can advance (first wait before next content is satisfied).
  // NOTE: parked ON an LLM interlude, the exit gate (until/agent-exit/
  // maxTurns) is applied by the caller — it needs the interlude's log.
  const canAdvance = canAdvanceToContent(entries, currentIndex, endIndex, context);

  // Stable reference for evaluating a specific wait entry
  const isWaitSatisfied = useCallback(
    (entry: WaitCommand) => evaluateWaitEntry(entry, context),
    [context]
  );

  return { canAdvance, isWaitSatisfied, context };
}
