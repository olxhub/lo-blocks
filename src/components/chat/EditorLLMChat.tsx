// src/components/chat/EditorLLMChat.jsx
'use client';

import { useCallback } from 'react';
import { ChatComponent, InputFooter } from '@/components/common/ChatComponent';
import { useChat } from '@/lib/llm/reduxClient';
import { buildSystemPrompt, getFileType } from '@/lib/editor/context';
import { createEditorTools } from '@/lib/editor/tools';

/**
 * LLM chat for the editor pane.
 *
 * @param {object} props
 * @param {string} props.path - Current file path
 * @param {string} props.content - Current file content
 * @param {function} props.onApplyEdit - Called when LLM applies an edit
 * @param {function} props.onOpenFile - Called when LLM wants to open a file
 * @param {'light' | 'dark'} [props.theme='light'] - Color theme
 */
export default function EditorLLMChat({ path, content, onApplyEdit, onOpenFile, theme = 'light' }) {
  const initialMessage = path
    ? `Editing: ${path}. Ask me to help with this content.`
    : 'Select a file to edit, then ask me for help.';

  const { messages, sendMessage } = useChat({ initialMessage });

  // Build tools and context fresh at call time - no stale closures
  const handleSendMessage = useCallback(async (text, attachedFile) => {
    const tools = createEditorTools({
      onApplyEdit,
      onOpenFile,
      getCurrentContent: () => content,
      getFileType: () => getFileType(path),
      getCurrentPath: () => path,
    });
    const systemPrompt = await buildSystemPrompt({ path, content });
    const attachments = attachedFile ? [attachedFile] : [];

    sendMessage(text, { attachments, tools, systemPrompt });
  }, [path, content, onApplyEdit, onOpenFile, sendMessage]);

  const footer = <InputFooter onSendMessage={handleSendMessage} allowFileUpload theme={theme} />;

  return (
    <ChatComponent
      id="editor_llm_chat"
      messages={messages}
      footer={footer}
      height="flex-1"
      theme={theme}
    />
  );
}
