'use client';
// packages/shared/components/blocks/authoring/Studio/editorLLMChat.tsx
//
// LLM chat for the editor pane. Ported from apps/web/app/studio/EditorLLMChat.tsx.
//
// Color adaptation is handled by the CSS token system — place this inside a
// container with `data-color-mode="dark"` for dark-surface rendering.

import { useCallback } from 'react';
import { ChatComponent, InputFooter, type FileAttachment } from '@/components/common/ChatComponent';
import { useChat } from '@/lib/llm/reduxClient';
import type { LofsOrigin } from '@/lib/types';
import { buildSystemPrompt, getFileType } from './llmContext';
import { studioChatTools } from './llmTools';
import { STUDIO_NS } from './studioNs';

export interface EditorLLMChatProps {
  /** Current file path ('' or undefined when no file is open) */
  path: string | undefined;
  /** Returns current file content — read at send time (no stale closures) */
  getContent: () => string;
  /** Called when the LLM applies an edit */
  onApplyEdit?: (content: string) => void;
  /** Called when the LLM wants to open a file */
  onOpenFile?: (path: string) => void;
  /** The source Studio is editing — bound into the chat's content tools */
  source?: LofsOrigin;
}

export default function EditorLLMChat({ path, getContent, onApplyEdit, onOpenFile, source }: EditorLLMChatProps) {
  const initialMessage = path
    ? `Editing: ${path}. Ask me to help with this content.`
    : 'Select a file to edit, then ask me for help.';

  // Use 'editor_llm_chat' as the chatId to persist chat state across tab switches
  const { messages, sendMessage } = useChat({ chatId: 'editor_llm_chat', initialMessage });

  // Build tools and context fresh at call time - no stale closures
  const handleSendMessage = useCallback(async (text: string, attachedFile: FileAttachment | null) => {
    const currentContent = getContent();
    const tools = await studioChatTools({
      getCurrentContent: getContent,
      getFileType: () => getFileType(path),
      onApplyEdit,
      onOpenFile,
      source,
    });
    const systemPrompt = await buildSystemPrompt({ path, content: currentContent });
    const attachments = attachedFile ? [attachedFile] : [];

    sendMessage(text, { attachments, tools, systemPrompt });
  }, [path, getContent, onApplyEdit, onOpenFile, source, sendMessage]);

  const footer = <InputFooter onSendMessage={handleSendMessage} allowFileUpload />;

  return (
    <ChatComponent
      id="editor_llm_chat"
      messages={messages}
      ns={STUDIO_NS}
      footer={footer}
      height="flex-1"
    />
  );
}
