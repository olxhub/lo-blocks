// Main client-side interface to the LLM.
//
// TODO: The name is aspirational: We're not yet fully redux.

'use client';

import { useState } from 'react';

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
// @param {object} params
// @param {array} params.tools - Default tool definitions (can be overridden per-call)
// @param {string} params.systemPrompt - Default system prompt (can be overridden per-call)
// @param {string} params.initialMessage - Initial message to show (default: 'Ask the LLM a question.')
export function useChat(params = {}) {
  const {
    tools: defaultTools = [],
    systemPrompt: defaultSystemPrompt,
    initialMessage = 'Ask the LLM a question.'
  } = params;
  const [messages, setMessages] = useState([
    { type: 'SystemMessage', text: initialMessage }
  ]);
  const [status, setStatus] = useState(LLM_STATUS.INIT);

  // sendMessage accepts per-call overrides for tools and systemPrompt
  // This allows building fresh tools with current values at call time
  const sendMessage = async (text, options = {}) => {
    const {
      attachments = [],
      tools = defaultTools,
      systemPrompt = defaultSystemPrompt,
    } = options;

    setStatus(LLM_STATUS.RUNNING);

    // Build display text (what user sees in chat)
    const attachmentSuffix = attachments.length > 0
      ? '\n\n' + attachments.map(a => `📎 ${a.name}`).join('\n')
      : '';
    const displayText = (text || '') + attachmentSuffix;

    // Build API text (what LLM sees - includes full file content)
    const attachmentContent = attachments.length > 0
      ? '\n\n' + attachments.map(a => `[Attached file: ${a.name}]\n\`\`\`\n${a.content}\n\`\`\``).join('\n\n')
      : '';
    const apiText = (text || '') + attachmentContent;

    const userMessage = { type: 'Line', speaker: 'You', text: displayText };
    setMessages(m => [...m, userMessage]);

    // Build history from messages (use apiText for the current message)
    let history = [...messages, { type: 'Line', speaker: 'You', text: apiText }]
      .filter((msg) => msg.type === 'Line')
      .map((msg) => ({
        role: msg.speaker === 'You' ? 'user' : 'assistant',
        content: msg.text,
      }));

    // Prepend system prompt if provided
    if (systemPrompt) {
      history = [{ role: 'system', content: systemPrompt }, ...history];
    }

    const { messages: newMessages, error } = await callLLM({
      history,
      tools,
      statusCallback: setStatus,
    });

    setMessages((m) => [...m, ...newMessages]);
    if (error) setStatus(LLM_STATUS.ERROR);
    // Otherwise, statusCallback inside callLLM handles success
  };

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
