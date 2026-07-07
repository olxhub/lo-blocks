'use client';
// packages/shared/components/blocks/scenario/Chat/llmInterlude.ts
//
// The LLM producer for `>>> llm` interludes. The script player derives its
// transcript from (script, cursor); interlude turns are live conversation,
// so they append to the Chat block's `messages` log field (an actor-stamped
// CRDT), keyed by the body index of the interlude they belong to.
//
// Context is declarative: the interlude's prompt carries state-language
// {{...}} interpolations (the Markdown pattern), re-resolved at each turn,
// so the agent sees current state. Tools come from named toolsets on the
// browser tool plane — the same MCP tools external agents use. The agent
// has NO script-level privileges (no set-command path): it affects the
// world only through its declared toolsets.

import { useCallback, useMemo, useState } from 'react';
import { useFieldState, appendToLog } from '@/lib/state';
import { callLLM } from '@/lib/llm/reduxClient';
import { ensureServerTools, llmToolsFor } from '@/lib/mcp/browserTools';
import {
  extractInterpolations, extractInterpolationRefs, useReferences, createContext,
  parse, evaluate,
} from '@/lib/stateLanguage';
import type { RuntimeProps, ChatMessage } from '@/lib/types';
import type { ApiMessage, LlmTool } from '@/lib/llm/types';
import type { ConversationEntry, LlmCommand } from './_chatTypes';

/** One runtime turn in the log field: which interlude it belongs to + the message. */
export interface InterludeLogItem {
  atIndex: number;
  message: ChatMessage;
}

export interface InterludeState {
  /** All runtime turns, across every interlude in this chat instance. */
  logItems: InterludeLogItem[];
  /** The interlude the cursor is parked on, or null. */
  active: LlmCommand | null;
  activeIndex: number;
  turnsUsed: number;
  maxTurns: number | null;
  busy: boolean;
  sendMessage: (text: string) => Promise<void>;
}

const EMPTY_ITEMS: InterludeLogItem[] = [];

export function useLlmInterlude(
  props: RuntimeProps,
  allEntries: ConversationEntry[],
  windowedIndex: number,
): InterludeState {
  const [rawItems] = useFieldState(props, props.fields.messages, EMPTY_ITEMS);
  const logItems = rawItems as InterludeLogItem[];

  const current = allEntries[windowedIndex];
  const active = current?.type === 'LlmCommand' ? current : null;
  const activeIndex = active ? windowedIndex : -1;

  // Live prompt context: {{...}} interpolations, re-resolved every render.
  const promptText = active?.prompt ?? '';
  const { interpolations, refs } = useMemo(() => ({
    interpolations: extractInterpolations(promptText),
    refs: extractInterpolationRefs(promptText),
  }), [promptText]);
  const resolved = useReferences(props, refs);

  const [busy, setBusy] = useState(false);

  const interludeItems = useMemo(
    () => logItems.filter(it => it.atIndex === activeIndex),
    [logItems, activeIndex],
  );
  const turnsUsed = interludeItems.filter(
    it => it.message.type === 'Line' && it.message.speaker === 'You',
  ).length;
  const maxTurns = active?.metadata.maxTurns ? parseInt(active.metadata.maxTurns, 10) : null;

  const sendMessage = useCallback(async (text: string) => {
    if (!active || busy || !text.trim()) return;
    setBusy(true);
    try {
      appendToLog(props, props.fields.messages, {
        atIndex: activeIndex,
        message: { type: 'Line', speaker: 'You', text },
      });

      // System prompt: the authored prompt with interpolations evaluated
      // against live state (the _Markdown pattern), plus persona and the
      // scripted conversation so far as context.
      const evalContext = createContext(resolved);
      let promptResolved = promptText;
      for (let i = interpolations.length - 1; i >= 0; i--) {
        const { expression, start, end } = interpolations[i];
        let value = '';
        try {
          const evaluated = evaluate(parse(expression), evalContext);
          if (evaluated !== null && evaluated !== undefined) {
            value = typeof evaluated === 'object' ? JSON.stringify(evaluated) : String(evaluated);
          }
        } catch (e) {
          console.warn('[Chat] Failed to evaluate prompt interpolation:', expression, e);
          value = `{{${expression}}}`;
        }
        promptResolved = promptResolved.slice(0, start) + value + promptResolved.slice(end);
      }

      const scriptSoFar = allEntries.slice(0, windowedIndex)
        .filter((e): e is Extract<ConversationEntry, { type: 'Line' }> => e.type === 'Line')
        .map(l => `${l.speaker}: ${l.text}`)
        .join('\n');

      const systemPrompt = [
        `You are "${active.participant}", a participant in an educational dialogue. Stay in role; be concise.`,
        promptResolved,
        scriptSoFar ? `The scripted conversation so far:\n${scriptSoFar}` : '',
      ].filter(Boolean).join('\n\n');

      // Prior interlude turns become the chat history.
      const history: ApiMessage[] = [
        { role: 'system', content: systemPrompt },
        ...interludeItems
          .filter((it): it is InterludeLogItem & { message: { type: 'Line'; speaker: string; text: string } } =>
            it.message.type === 'Line')
          .map(it => ({
            role: (it.message.speaker === 'You' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: it.message.text,
          })),
        { role: 'user', content: text },
      ];

      // Tools: named toolsets from the browser tool plane. No toolsets
      // declared → a plain conversation.
      let tools: LlmTool[] = [];
      const toolsetNames = (active.metadata.tools ?? '').split(',').map(t => t.trim()).filter(Boolean);
      if (toolsetNames.length > 0) {
        try {
          await ensureServerTools();
        } catch (e) {
          console.warn('[Chat] Server tool discovery failed; interlude runs without server tools:', e);
        }
        tools = llmToolsFor(toolsetNames);
      }

      const { messages: newMessages } = await callLLM({ history, tools });
      for (const m of newMessages) {
        // The loop labels replies 'LLM'; re-attribute to the cast participant.
        const message: ChatMessage = m.type === 'Line' && m.speaker === 'LLM'
          ? { ...m, speaker: active.participant }
          : m;
        appendToLog(props, props.fields.messages, { atIndex: activeIndex, message });
      }
    } finally {
      setBusy(false);
    }
  }, [active, activeIndex, busy, props, promptText, interpolations, resolved, interludeItems, allEntries, windowedIndex]);

  return { logItems, active, activeIndex, turnsUsed, maxTurns, busy, sendMessage };
}
