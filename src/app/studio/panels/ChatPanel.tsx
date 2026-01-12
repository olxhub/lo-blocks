// src/app/studio/panels/ChatPanel.tsx
'use client';

import EditorLLMChat from '@/components/chat/EditorLLMChat';

interface ChatPanelProps {
  filePath: string;
  content: string;
  onApplyEdit: (newContent: string) => void;
  onOpenFile: (path: string) => void;
}

export function ChatPanel({ filePath, content, onApplyEdit, onOpenFile }: ChatPanelProps) {
  return (
    <div className="sidebar-panel chat-panel">
      <EditorLLMChat
        path={filePath}
        content={content}
        onApplyEdit={onApplyEdit}
        onOpenFile={onOpenFile}
        theme="dark"
      />
    </div>
  );
}
