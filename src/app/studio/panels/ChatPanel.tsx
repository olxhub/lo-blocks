// src/components/studio/panels/ChatPanel.tsx
'use client';

import EditorLLMChat from '@/components/chat/EditorLLMChat';

interface ChatPanelProps {
  filePath: string;
  content: string;
  onApplyEdit: (newContent: string) => void;
}

export function ChatPanel({ filePath, content, onApplyEdit }: ChatPanelProps) {
  return (
    <div className="sidebar-panel chat-panel">
      <EditorLLMChat
        path={filePath}
        content={content}
        onApplyEdit={onApplyEdit}
        theme="dark"
      />
    </div>
  );
}
