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

async function handleToolCalls(toolCalls, tools) {
  // Collect promises for all tool calls in parallel
  return Promise.all(toolCalls.map(async (call) => {
    const tool = findToolByName(tools, call.function.name);
    let result = '';
    if (tool) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
      result = await tool.callback(args);
    }
    return {
      role: 'tool',
      content: result,
      tool_call_id: call.id,
    };
  }));
}

// Small helper to find tool in a list of tools
function findToolByName(tools, name) {
  return tools?.find(t => t.function.name === name);
}

// Core LLM call logic, standalone async function.
//
// TODO: Do we want to replace this with a standard library?
export async function callLLM(params) {
  const {
    history,
    prompt,
    tools = [],
    statusCallback = () => null,
    model = 'gpt-4.1-nano'
  } = params;

  // Validation: exactly one of prompt or history must be provided
  if ((!prompt && !history) || (prompt && history)) {
    throw new Error('Must provide exactly one of: prompt or history');
  }

  // Convert prompt to history if needed
  const messages = history || [{ role: 'user', content: prompt }];

  let loopCount = 0;
  let newMessages = [];
  while (loopCount++ < 10) {
    try {
      const res = await fetch('/api/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
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
        const toolResponses = await handleToolCalls(toolCalls, tools);
        newMessages = [
          ...newMessages,
          json.message,
          ...toolResponses
        ];
        // If there's also content, return it (some models send both)
        if (content) {
          statusCallback(LLM_STATUS.RESPONSE_READY);
          return {
            messages: [...newMessages, { type: 'Line', speaker: 'LLM', text: content }],
            error: false,
          };
        }
        continue;
      }

      // No tool calls - check for content
      if (content) {
        statusCallback(LLM_STATUS.RESPONSE_READY);
        return {
          messages: [...newMessages, { type: 'Line', speaker: 'LLM', text: content }],
          error: false,
        };
      } else {
        statusCallback(LLM_STATUS.ERROR);
        return {
          messages: [...newMessages, { type: 'SystemMessage', text: 'No response from LLM' }],
          error: true,
        };
      }
    } catch (err) {
      statusCallback(LLM_STATUS.ERROR);
      return {
        messages: [...newMessages, { type: 'SystemMessage', text: 'Error contacting LLM' }],
        error: true,
      };
    }
  }
  // If loop exceeds
  statusCallback(LLM_STATUS.ERROR);
  return {
    messages: [...newMessages, { type: 'SystemMessage', text: 'Too many tool calls without a final response. Try asking again.' }],
    error: true,
  };
}

// Most common interface to LLM.
//
// @param {object} params
// @param {array} params.tools - Tool definitions with callbacks
// @param {string} params.systemPrompt - System prompt (injected at start of each request)
// @param {string} params.initialMessage - Initial message to show (default: 'Ask the LLM a question.')
export function useChat(params = {}) {
  const { tools = [], systemPrompt, initialMessage = 'Ask the LLM a question.' } = params;
  const [messages, setMessages] = useState([
    { type: 'SystemMessage', text: initialMessage }
  ]);
  const [status, setStatus] = useState(LLM_STATUS.INIT);

  const sendMessage = async (text) => {
    setStatus(LLM_STATUS.RUNNING);

    const userMessage = { type: 'Line', speaker: 'You', text };
    setMessages(m => [...m, userMessage]);

    // Build history from messages
    let history = [...messages, userMessage]
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
export async function callLLMSimple(prompt, options = {}) {
  const { model } = options;

  const { messages, error } = await callLLM({
    prompt,
    model,
    statusCallback: () => {}, // No status needed for simple calls
  });

  if (error) {
    throw new Error(messages[0]?.text || 'LLM call failed');
  }

  // Extract just the text content
  return messages.find(m => m.type === 'Line' && m.speaker === 'LLM')?.text || 'No response';
}
