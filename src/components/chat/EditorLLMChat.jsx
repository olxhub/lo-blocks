// src/components/chat/EditorLLMChat.jsx
'use client';

import { ChatComponent, InputFooter } from '@/components/common/ChatComponent';
import { useChat } from '@/lib/llm/reduxClient.jsx';

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

export default function EditorLLMChat() {
  const { messages, sendMessage } = useChat({tools: tools});
  const footer = <InputFooter onSendMessage={sendMessage} />;

  return (
    <ChatComponent id="editor_llm_chat" messages={messages} footer={footer} height="flex-1" />
  );
}
