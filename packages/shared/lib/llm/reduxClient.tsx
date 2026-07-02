// Main client-side interface to the LLM.
//
// Uses Redux for persistent chat state that survives component unmount/remount.

'use client';

import { useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import * as lo_event from 'lo_event';
import { hashContent } from '@/lib/util/index';
import {
  CHAT_ADD_MESSAGE,
  CHAT_ADD_MESSAGES,
  CHAT_SET_STATUS,
} from '@/lib/state/store';
import type { ChatMessage, ChatLineMessage, RootState } from '@/lib/types';
import type { ApiMessage, LlmTool, ToolCall, ToolResult, ChatCompletionResponse } from './types';

const LLM_ENDPOINT = '/api/llm/chat/completions';

// In progress: State machine of LLM status
export const LLM_STATUS = {
  INIT: 'LLM_INIT',
  RUNNING: 'LLM_RUNNING',
  RESPONSE_READY: 'LLM_RESPONSE_READY',
  ERROR: 'LLM_ERROR',
  TOOL_RUNNING: 'LLM_TOOL_RUNNING',
};

// Execute tool calls sequentially and return canonical results.
// Tools run in order so each sees the effects of previous tools.
// Caller derives API and display formats as needed.
async function handleToolCalls(toolCalls: ToolCall[], tools: LlmTool[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of toolCalls) {
    const tool = findToolByName(tools, call.function.name);
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
    const result = tool ? await tool.callback(args) : '';

    // Single canonical format
    results.push({ id: call.id, name: call.function.name, args, result });
  }
  return results;
}

// Small helper to find tool in a list of tools
function findToolByName(tools: LlmTool[], name: string): LlmTool | undefined {
  return tools?.find(t => t.function.name === name);
}

// Core LLM call logic, standalone async function.
//
// TODO: Do we want to replace this with a standard library?
// TODO: Add a 'profile' parameter that selects server-side presets
//       (model, system prompt, rate limits, etc.)
export interface CallLLMParams {
  history?: ApiMessage[];
  prompt?: string;
  tools?: LlmTool[];
  statusCallback?: (status: string) => void;
}

export interface CallLLMResult {
  messages: ChatMessage[];
  error: boolean;
}

export async function callLLM(params: CallLLMParams): Promise<CallLLMResult> {
  const {
    history,
    prompt,
    tools = [],
    statusCallback = () => null,
  } = params;

  // Validation: exactly one of prompt or history must be provided
  if ((!prompt && !history) || (prompt && history)) {
    throw new Error('Must provide exactly one of: prompt or history');
  }

  // Convert prompt to history if needed
  const messages: ApiMessage[] = history ?? [{ role: 'user', content: prompt ?? '' }];

  let loopCount = 0;
  let newMessages: ApiMessage[] = [];
  let displayMessagesAccum: ChatMessage[] = [];  // Tool calls to show in chat
  while (loopCount++ < 10) {
    try {
      const res = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, ...newMessages],
          tools: tools ? tools.map(({ callback, ...rest }) => rest) : [],
        }),
      });
      const json = ((await res.json()) as ChatCompletionResponse).choices?.[0];
      const content = json?.message?.content;
      const toolCalls = json?.message?.tool_calls;

      // Handle tool calls if present
      if (toolCalls?.length) {
        statusCallback(LLM_STATUS.TOOL_RUNNING);
        const toolResults = await handleToolCalls(toolCalls, tools);

        // Add to API history (for next request)
        newMessages = [
          ...newMessages,
          json.message,
          ...toolResults.map(r => ({ role: 'tool' as const, content: r.result, tool_call_id: r.id }))
        ];

        // Add to display messages
        displayMessagesAccum = [
          ...displayMessagesAccum,
          ...toolResults.map(r => ({ type: 'ToolCall' as const, name: r.name, args: r.args, result: r.result }))
        ];

        // If there's also content, return it (some models send both)
        if (content) {
          statusCallback(LLM_STATUS.RESPONSE_READY);
          return {
            messages: [...displayMessagesAccum, { type: 'Line', speaker: 'LLM', text: content }],
            error: false,
          };
        }
        continue;
      }

      // No tool calls - check for content
      if (content) {
        statusCallback(LLM_STATUS.RESPONSE_READY);
        return {
          messages: [...displayMessagesAccum, { type: 'Line', speaker: 'LLM', text: content }],
          error: false,
        };
      } else {
        statusCallback(LLM_STATUS.ERROR);
        return {
          messages: [...displayMessagesAccum, { type: 'SystemMessage', text: 'No response from LLM' }],
          error: true,
        };
      }
    } catch (err) {
      statusCallback(LLM_STATUS.ERROR);
      return {
        messages: [...displayMessagesAccum, { type: 'SystemMessage', text: 'Error contacting LLM' }],
        error: true,
      };
    }
  }
  // If loop exceeds
  statusCallback(LLM_STATUS.ERROR);
  return {
    messages: [...displayMessagesAccum, { type: 'SystemMessage', text: 'Too many tool calls without a final response. Try asking again.' }],
    error: true,
  };
}

// Most common interface to LLM.
//
// Chat state is persisted in Redux, keyed by chatId. This allows chat history
// to survive component unmount/remount (e.g., when switching sidebar tabs).
//
// @param {object} params
// @param {string} params.chatId - Unique ID for this chat (default: 'default')
// @param {array} params.tools - Default tool definitions (can be overridden per-call)
// @param {string} params.systemPrompt - Default system prompt (can be overridden per-call)
// @param {string} params.initialMessage - Initial message to show (default: 'Ask the LLM a question.')
export interface UseChatParams {
  chatId?: string;
  tools?: LlmTool[];
  systemPrompt?: string;
  initialMessage?: string;
}

/** A file picked in the UI before it's hashed and stored as a MessageAttachment. */
export interface AttachmentInput {
  name: string;
  content: string;
}

export interface SendMessageOptions {
  attachments?: AttachmentInput[];
  tools?: LlmTool[];
  systemPrompt?: string;
}

export function useChat(params: UseChatParams = {}) {
  const {
    chatId = 'default',
    tools: defaultTools = [],
    systemPrompt: defaultSystemPrompt,
    initialMessage = 'Ask the LLM a question.'
  } = params;

  const chatState = useSelector(
    (state: RootState) => state.application_state.chat?.[chatId]
  );
  const messages: ChatMessage[] = chatState?.messages ?? [];
  const status: string = chatState?.status ?? LLM_STATUS.INIT;

  // Dispatch helpers
  const addMessage = useCallback((message: ChatMessage) => {
    lo_event.logEvent(CHAT_ADD_MESSAGE, { chatId, message });
  }, [chatId]);

  const addMessages = useCallback((msgs: ChatMessage[]) => {
    lo_event.logEvent(CHAT_ADD_MESSAGES, { chatId, messages: msgs });
  }, [chatId]);

  const setStatus = useCallback((newStatus: string) => {
    lo_event.logEvent(CHAT_SET_STATUS, { chatId, status: newStatus });
  }, [chatId]);

  // Initialize with initial message if chat is empty
  useEffect(() => {
    if (messages.length === 0) {
      addMessage({ type: 'SystemMessage', text: initialMessage });
    }
  }, [chatId, messages.length, initialMessage, addMessage]);

  // sendMessage accepts per-call overrides for tools and systemPrompt
  // This allows building fresh tools with current values at call time
  const sendMessage = useCallback(async (text: string, options: SendMessageOptions = {}) => {
    const {
      attachments = [],
      tools = defaultTools,
      systemPrompt = defaultSystemPrompt,
    } = options;

    setStatus(LLM_STATUS.RUNNING);

    // Process attachments: add hash, prepare for storage/API/display
    // TODO: convertToText(attachment.content) once conversion abstraction is implemented
    //       (e.g., pptx2text, pdf2text). For now, assume content is already text.
    //       Then: uploadToS3orSimilarStore({ key: hash, text: convertedText, name, body, timestamp })
    const processedAttachments = await Promise.all(attachments.map(async a => ({
      name: a.name,
      hash: await hashContent(a.content),
      body: a.content,  // To be replaced with convertedText once conversion is implemented
    })));

    // Build display text (what user sees in chat - strip body)
    const attachmentSuffix = processedAttachments.length > 0
      ? '\n\n' + processedAttachments.map(a => `📎 ${a.name}`).join('\n')
      : '';
    const displayText = (text || '') + attachmentSuffix;

    // Build API text for LLM (what LLM sees - full file content)
    const attachmentContent = processedAttachments.length > 0
      ? '\n\n' + processedAttachments.map(a => `[Attached file: ${a.name}]\n\`\`\`\n${a.body}\n\`\`\``).join('\n\n')
      : '';
    const apiText = (text || '') + attachmentContent;

    // Store message with attachments so they persist across follow-ups
    // User messages store: { name, hash, body } for full replicability
    // This allows follow-up questions to reference the same files
    const userMessage: ChatLineMessage = {
      type: 'Line',
      speaker: 'You',
      text: displayText,
      attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
    };
    addMessage(userMessage);

    // Build history from messages (reconstructing apiText for LLM context)
    // This ensures follow-up questions include full file content in history
    // Note: messages here is the snapshot at time of call
    const lineMessages = [
      ...messages,
      { type: 'Line', speaker: 'You', text: apiText } as ChatLineMessage,
    ].filter((msg): msg is ChatLineMessage => msg.type === 'Line');
    let history: ApiMessage[] = lineMessages.map((msg) => {
      // Reconstruct apiText for user messages with attachments
      let content = msg.text;
      if (msg.attachments && msg.attachments.length > 0) {
        const attachmentContent = msg.attachments
          .map(a => `[Attached file: ${a.name}]\n\`\`\`\n${a.body}\n\`\`\``)
          .join('\n\n');
        content = msg.text.replace(/\n\n📎[\s\S]*$/, '') + '\n\n' + attachmentContent;
      }
      return {
        role: msg.speaker === 'You' ? 'user' : 'assistant',
        content,
      };
    });

    // Prepend system prompt if provided
    if (systemPrompt) {
      history = [{ role: 'system', content: systemPrompt }, ...history];
    }

    const { messages: newMessages, error } = await callLLM({
      history,
      tools,
      statusCallback: setStatus,
    });

    addMessages(newMessages);
    if (error) setStatus(LLM_STATUS.ERROR);
    // Otherwise, statusCallback inside callLLM handles success
  }, [messages, defaultTools, defaultSystemPrompt, addMessage, addMessages, setStatus]);

  return { messages, sendMessage, status };
}

// Simple wrapper that returns just the text content
export async function callLLMSimple(prompt: string): Promise<string> {
  const { messages, error } = await callLLM({
    prompt,
    statusCallback: () => {}, // No status needed for simple calls
  });

  if (error) {
    const first = messages[0];
    const detail = first && 'text' in first ? first.text : undefined;
    throw new Error(detail || 'LLM call failed');
  }

  // Extract just the text content
  return messages.find(
    (m): m is ChatLineMessage => m.type === 'Line' && m.speaker === 'LLM'
  )?.text || 'No response';
}
