// src/components/chat/EditorLLMChat.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChatComponent, InputFooter } from '@/components/common/ChatComponent';
import { useChat } from '@/lib/llm/reduxClient.jsx';
import { buildSystemPrompt } from '@/lib/editor/context';
import { createEditorTools } from '@/lib/editor/tools';

/**
 * LLM chat for the editor pane.
 *
 * @param {object} props
 * @param {string} props.path - Current file path
 * @param {string} props.content - Current file content
 * @param {function} props.onProposeEdit - Called when LLM proposes an edit
 */
export default function EditorLLMChat({ path, content, onProposeEdit }) {
  const [systemPrompt, setSystemPrompt] = useState(null);

  // Build system prompt when path/content changes
  useEffect(() => {
    buildSystemPrompt({ path, content })
      .then(setSystemPrompt)
      .catch(err => console.error('Failed to build system prompt:', err));
  }, [path, content]);

  // Create tools with edit callback
  const tools = useMemo(
    () => createEditorTools({ onProposeEdit }),
    [onProposeEdit]
  );

  const initialMessage = path
    ? `Editing: ${path}. Ask me to help with this content.`
    : 'Select a file to edit, then ask me for help.';

  const { messages, sendMessage } = useChat({
    tools,
    systemPrompt,
    initialMessage,
  });

  const footer = <InputFooter onSendMessage={sendMessage} />;

  return (
    <ChatComponent
      id="editor_llm_chat"
      messages={messages}
      footer={footer}
      height="flex-1"
    />
  );
}
