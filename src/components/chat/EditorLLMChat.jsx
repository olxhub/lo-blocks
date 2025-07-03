// src/components/chat/EditorLLMChat.jsx
'use client';

import { useState } from 'react';
import { ChatComponent, InputFooter } from '@/components/common/ChatComponent';

// statusEnum.js
export const ChatStatus = {
  IDLE: 'idle',
  LOADING: 'loading',
  ERROR: 'error',
  // Add more statuses as needed, e.g., TOOL_CALLING: 'tool_calling'
};


// TODO: Implement a state machine to disable the footer while waiting for a
// response. This will likely leverage Redux and src/lib/llm/client.jsx.

const tools = [{
  type: "function",
  function: {
    name: "helloInGerman",
    description: "Returns the phrase 'Hello, World!' in German.",
    parameters: { type: "object", properties: {}, required: [] }
  }
}];

const toolFunctions = {
  helloInGerman: async () => "Hallo, Welt!",
};

function useChat(props) {
  const [messages, setMessages] = useState([
    { type: 'SystemMessage', text: 'Ask the LLM a question.' }
  ]);
  const [status, setStatus] = useState('idle'); // idle | loading | error

  const sendMessage = async (text) => {
    setStatus('loading');
    const userMessage = { type: 'Line', speaker: 'You', text };
    setMessages((m) => [...m, userMessage]);

    const history = [...messages, userMessage]
      .filter((msg) => msg.type === 'Line')
      .map((msg) => ({
        role: msg.speaker === 'You' ? 'user' : 'assistant',
        content: msg.text,
      }));

    try {
      const res = await fetch('/api/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: history,
          // ...include any props.tools etc as needed
        }),
      });
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || json.response?.content;
      if (content) {
        setMessages((m) => [...m, { type: 'Line', speaker: 'LLM', text: content }]);
      }
      setStatus('idle');
    } catch (err) {
      setMessages((m) => [...m, { type: 'SystemMessage', text: 'Error contacting LLM' }]);
      setStatus('error');
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
