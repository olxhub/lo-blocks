// TODO: Aspirational: Not yet redux.

import { useState } from 'react';

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

function findToolByName(tools, name) {
  return tools?.find(t => t.function.name === name);
}

/* Move to something like:
async function callLLM( params ) {
  const { history, tools=[], statusCallback = () => null } = params;

  let loopCount = 0;
  let newMessages = [];
  while (loopCount++ < 5) {
    try {
      const res = await fetch('/api/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4.1-nano',
          messages: [...history, ...newMessages],
          tools: tools ? tools.map(({ callback, ...rest }) => rest) : []
        }),
      });
      const json = (await res.json()).choices?.[0];
      const content = json?.message?.content;
      const toolCalls = json?.message.tool_calls;
      if (toolCalls?.length) {
        const toolResponses = await handleToolCalls(toolCalls, tools);
        newMessages = [
          ...newMessages,
          json.message,
          ...toolResponses
        ];
        continue;
      }
      if (content) {
        statusCallback(LLM_STATUS.RESPONSE_READY);
        return [...newMessages, { type: 'Line', speaker: 'LLM', text: content }];
        break;
      } else {
        statusCallback(LLM_STATUS.ERROR);
      }
    } catch (err) {
      statusCallback(LLM_STATUS.ERROR);
      return [...newMessages,  { type: 'SystemMessage', text: 'Error contacting LLM' }];
      break;
    }
  }
}
*/
function callLLM( params ) {
  const { statusCallback, history, tools=[] } = params;
}

export function useChat(params = {}) {
  const { tools = [] } = params;
  const [messages, setMessages] = useState([
    { type: 'SystemMessage', text: 'Ask the LLM a question.' }
  ]);
  const [status, setStatus] = useState(LLM_STATUS.INIT);

  const sendMessage = async (text) => {
    setStatus(LLM_STATUS.RUNNING);

    const userMessage = { type: 'Line', speaker: 'You', text };
    setMessages(m => [...m, userMessage]);

    let history = [...messages, userMessage]
      .filter((msg) => msg.type === 'Line')
      .map((msg) => ({
        role: msg.speaker === 'You' ? 'user' : 'assistant',
        content: msg.text,
      }));

    let loopCount = 0;
    let newMessages = [];
    while (loopCount++ < 5) {
      try {
        const res = await fetch('/api/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4.1-nano',
            messages: [...history, ...newMessages],
            tools: tools ? tools.map(({ callback, ...rest }) => rest) : []
          }),
        });
        const json = (await res.json()).choices?.[0];
        const content = json?.message?.content;
        const toolCalls = json?.message.tool_calls;
        if (toolCalls?.length) {
          const toolResponses = await handleToolCalls(toolCalls, tools);
          newMessages = [
            ...newMessages,
            json.message,
            ...toolResponses
          ];
          continue;
        }
        if (content) {
          setMessages((m) => [...m, { type: 'Line', speaker: 'LLM', text: content }]);
          setStatus(LLM_STATUS.RESPONSE_READY);
          break;
        } else {
          setStatus(LLM_STATUS.ERROR);
        }
      } catch (err) {
        setMessages((m) => [...m, { type: 'SystemMessage', text: 'Error contacting LLM' }]);
        setStatus(LLM_STATUS.ERROR);
        break;
      }
    }
  };

  return { messages, sendMessage, status };
}
