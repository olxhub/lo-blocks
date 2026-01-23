// Main client-side interface to the LLM.
//
// Uses Redux for persistent chat state that survives component unmount/remount.

'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import * as lo_event from 'lo_event';
import { hashContent } from '@/lib/util/index';
import {
  CHAT_ADD_MESSAGE,
  CHAT_ADD_MESSAGES,
  CHAT_SET_STATUS,
} from '@/lib/state/store';

// In progress: State machine of LLM status
export const LLM_STATUS = {
  INIT: 'LLM_INIT',
  RUNNING: 'LLM_RUNNING',
  RESPONSE_READY: 'LLM_RESPONSE_READY',
  ERROR: 'LLM_ERROR',
  TOOL_RUNNING: 'LLM_TOOL_RUNNING',
};

// Execute tool calls and return canonical results.
// Caller derives API and display formats as needed.
async function handleToolCalls(toolCalls, tools) {
  return Promise.all(toolCalls.map(async (call) => {
    const tool = findToolByName(tools, call.function.name);
    let args = {};
    try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
    const result = tool ? await tool.callback(args) : '';

    // Single canonical format
    return { id: call.id, name: call.function.name, args, result };
  }));
}

// Small helper to find tool in a list of tools
function findToolByName(tools, name) {
  return tools?.find(t => t.function.name === name);
}

// Core LLM call logic, standalone async function.
//
// TODO: Do we want to replace this with a standard library?
// TODO: Add a 'profile' parameter that selects server-side presets
//       (model, system prompt, rate limits, etc.)
export async function callLLM(params) {
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
  const messages = history || [{ role: 'user', content: prompt }];

  let loopCount = 0;
  let newMessages = [];
  let displayMessagesAccum = [];  // Tool calls to show in chat
  while (loopCount++ < 10) {
    try {
      const res = await fetch('/api/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, ...newMessages],
          tools: tools ? tools.map(({ callback, ...rest }) => rest) : [],
        }),
      });
      const json = (await res.json()).choices?.[0];
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
          ...toolResults.map(r => ({ role: 'tool', content: r.result, tool_call_id: r.id }))
        ];

        // Add to display messages
        displayMessagesAccum = [
          ...displayMessagesAccum,
          ...toolResults.map(r => ({ type: 'ToolCall', name: r.name, args: r.args, result: r.result }))
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
export function useChat(params = {}) {
  const {
    chatId = 'default',
    tools: defaultTools = [],
    systemPrompt: defaultSystemPrompt,
    initialMessage = 'Ask the LLM a question.'
  } = params;

  // Read from Redux
  const chatState = useSelector(
    (state) => state?.application_state?.chat?.[chatId]
  );
  const messages = chatState?.messages ?? [];
  const status = chatState?.status ?? LLM_STATUS.INIT;

  // Dispatch helpers
  const addMessage = useCallback((message) => {
    lo_event.logEvent(CHAT_ADD_MESSAGE, { chatId, message });
  }, [chatId]);

  const addMessages = useCallback((msgs) => {
    lo_event.logEvent(CHAT_ADD_MESSAGES, { chatId, messages: msgs });
  }, [chatId]);

  const setStatus = useCallback((newStatus) => {
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
  const sendMessage = useCallback(async (text, options = {}) => {
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
    const userMessage = {
      type: 'Line',
      speaker: 'You',
      text: displayText,
      attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
    };
    addMessage(userMessage);

    // Build history from messages (reconstructing apiText for LLM context)
    // This ensures follow-up questions include full file content in history
    // Note: messages here is the snapshot at time of call
    let history = [...messages, { type: 'Line', speaker: 'You', text: apiText }]
      .filter((msg) => msg.type === 'Line')
      .map((msg) => {
        // Reconstruct apiText for user messages with attachments
        let content = msg.text;
        if (msg.attachments && msg.attachments.length > 0) {
          const attachmentContent = msg.attachments
            .map(a => `[Attached file: ${a.name}]\n\`\`\`\n${a.body}\n\`\`\``)
            .join('\n\n');
          content = msg.text.replace(/\n\n📎.*$/s, '') + '\n\n' + attachmentContent;
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
export async function callLLMSimple(prompt) {
  const { messages, error } = await callLLM({
    prompt,
    statusCallback: () => {}, // No status needed for simple calls
  });

  if (error) {
    throw new Error(messages[0]?.text || 'LLM call failed');
  }

  // Extract just the text content
  return messages.find(m => m.type === 'Line' && m.speaker === 'LLM')?.text || 'No response';
}
