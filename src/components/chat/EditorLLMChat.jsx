// src/components/chat/EditorLLMChat.jsx
'use client';

import { useState } from 'react';
import { ChatComponent, InputFooter } from '@/components/common/ChatComponent';

// TODO: Implement a state machine to disable the footer while waiting for a
// response. This will likely leverage Redux and src/lib/llm/client.jsx.

const tools = [{
  type: "function",
  function: {
    name: "helloInGerman",
    description: "Returns the phrase 'Hello, World!' in German.",
    parameters: { type: "object", properties: {}, required: [] }
  },
  callback: async () => "Hallo, Welt!",
}];

export const LLM_STATUS = {
  INIT: 'LLM_INIT',
  RUNNING: 'LLM_RUNNING',
  RESPONSE_READY: 'LLM_RESPONSE_READY',
  ERROR: 'LLM_ERROR',
  TOOL_RUNNING: 'LLM_TOOL_RUNNING',
};

function useChat(params = {}) {
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
    while (loopCount++ < 5) {
      try {
        const res = await fetch('/api/openai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4.1-nano',
            messages: history,
            tools: tools ? tools.map(({ callback, ...rest }) => rest) : []
          }),
        });
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || json.response?.content;
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
      }
    }
  };

  return { messages, sendMessage, status };
}

export default function EditorLLMChat() {
  const { messages, sendMessage } = useChat();
  const footer = <InputFooter onSendMessage={sendMessage} />;

  return (
    <ChatComponent id="editor_llm_chat" messages={messages} footer={footer} height="flex-1" />
  );
}
