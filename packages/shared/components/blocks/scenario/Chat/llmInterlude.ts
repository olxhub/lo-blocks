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
import { hashContent } from '@/lib/util';
import { useFieldState, appendToLog, fieldSelector } from '@/lib/state';
import { callLLM } from '@/lib/llm/reduxClient';
import { ensureServerTools, llmToolsFor } from '@/lib/mcp/browserTools';
import { advanceFrom } from '@/lib/player/advance';
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
  /** 'exit' — the agent ended the conversation (end_conversation tool).
   *  A durable, replayable marker: the exit gate reads it from the log. */
  control?: 'exit';
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
  /** The agent ended this interlude (end_conversation). Input closes. */
  ended: boolean;
  sendMessage: (text: string, file?: { name: string; content: string } | null) => Promise<void>;
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
  const ended = interludeItems.some(it => it.control === 'exit');

  const sendMessage = useCallback(async (text: string, file?: { name: string; content: string } | null) => {
    if (!active || busy || ended || !(text.trim() || file)) return;
    setBusy(true);
    try {
      // Attachments (opt-in via [upload=true]) are a first-class authoring
      // input — "here's my PPT deck, convert it to an SBA" / "here's a Word
      // file of changes for my lesson". Stored on the message (name + hash +
      // body) for replicability; the transcript shows a 📎 marker, the model
      // sees the full content.
      // TODO: convertToText() once the conversion abstraction exists
      // (pptx2text, docx2text, pdf2text) — today the content is used as-is,
      // so binary formats degrade.
      const attachments = file
        ? [{ name: file.name, hash: await hashContent(file.content), body: file.content }]
        : undefined;
      const displayText = (text || '') + (file ? `\n\n📎 ${file.name}` : '');
      appendToLog(props, props.fields.messages, {
        atIndex: activeIndex,
        message: { type: 'Line', speaker: 'You', text: displayText, ...(attachments ? { attachments } : {}) },
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

      // Prior interlude turns become the chat history. Messages with
      // attachments are reconstructed with the full file content (the
      // transcript shows only the 📎 marker).
      const withAttachments = (msg: { text: string; attachments?: Array<{ name: string; body: string }> }): string => {
        if (!msg.attachments?.length) return msg.text;
        const files = msg.attachments
          .map(a => `[Attached file: ${a.name}]\n\`\`\`\n${a.body}\n\`\`\``)
          .join('\n\n');
        return msg.text.replace(/\n\n📎[\s\S]*$/, '') + '\n\n' + files;
      };
      const history: ApiMessage[] = [
        { role: 'system', content: systemPrompt },
        ...interludeItems
          .filter((it): it is InterludeLogItem & { message: { type: 'Line'; speaker: string; text: string } } =>
            it.message.type === 'Line')
          .map(it => ({
            role: (it.message.speaker === 'You' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: withAttachments(it.message as { text: string; attachments?: Array<{ name: string; body: string }> }),
          })),
        { role: 'user', content: withAttachments({ text, attachments }) },
      ];

      // Tools: named toolsets from the browser tool plane. No toolsets
      // declared → conversation only. The agent ALWAYS gets its exit tool:
      // authors delegate "when to stop" in the prompt ("call end_conversation
      // once the student states the idea correctly").
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
      // exit=none (e.g. an open-ended assistant): no end tool — an exit
      // marker is durable, and a stray call would close the chat forever.
      let exitRequested = false;
      if (active.metadata.exit !== 'none') tools = [...tools, {
        function: {
          name: 'end_conversation',
          description:
            'End this conversation and let the scripted lesson resume. Call when the goal in your ' +
            'instructions is reached, the turn budget is spent, or you need to leave. Say your ' +
            'goodbye in the same reply.',
          parameters: { type: 'object', properties: {} },
        },
        callback: async () => {
          exitRequested = true;
          return 'The conversation will end after this reply.';
        },
      }];

      const { messages: newMessages } = await callLLM({ history, tools });
      for (const m of newMessages) {
        // The exit tool call is control flow, not conversation — don't display.
        if (m.type === 'ToolCall' && m.name === 'end_conversation') continue;
        // The loop labels replies 'LLM'; re-attribute to the cast participant.
        const message: ChatMessage = m.type === 'Line' && m.speaker === 'LLM'
          ? { ...m, speaker: active.participant }
          : m;
        appendToLog(props, props.fields.messages, { atIndex: activeIndex, message });
      }

      if (exitRequested) {
        // Durable exit marker (drives the exit gate + closes the input),
        // then resume the script — same path as the Continue button. Guard:
        // only auto-advance if the cursor is STILL parked on this interlude;
        // a late reply after the user already advanced must not advance the
        // script a second time (it would silently skip the next entry).
        appendToLog(props, props.fields.messages, {
          atIndex: activeIndex,
          control: 'exit',
          message: { type: 'SystemMessage', text: `${active.participant} ended the conversation.` },
        });
        const reduxState = props.runtime.store.getState();
        const cursor = fieldSelector(reduxState, props, props.fields.value, { fallback: -1 });
        if (cursor === activeIndex) {
          advanceFrom(props.nodeInfo, reduxState);
        }
      }
    } finally {
      setBusy(false);
    }
  }, [active, activeIndex, busy, ended, props, promptText, interpolations, resolved, interludeItems, allEntries, windowedIndex]);

  return { logItems, active, activeIndex, turnsUsed, maxTurns, busy, ended, sendMessage };
}
