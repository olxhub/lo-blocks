// packages/shared/components/common/ChatComponent.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import RenderMarkdown from '@/components/common/RenderMarkdown';
import NavArrow from '@/components/common/NavArrow';
import ExpandIcon from '@/components/common/ExpandIcon';
import * as cast from '@/lib/avatar/cast';
import { acceptString } from '@/lib/util/fileTypes';
import type { Cast, FaceExpression } from '@/lib/avatar/types';
import type { ContentNamespace } from '@/lib/types';
// Conversation types live in lib/types (the canonical source of truth).
// ChatDisplayEntry is the rendering union (includes non-serializable ElementEntry);
// ChatMessage is the serializable subset stored in Redux state.
import type {
  ChatDisplayEntry,
  ChatLineMessage,
  SystemMessageEntry,
  DateSeparatorEntry,
  ToolCallEntry,
  ElementEntry,
  MessageAttachment,
} from '@/lib/types';

/* ----------------------------------------------------------------
 * Types
 * -------------------------------------------------------------- */


export interface FileAttachment {
  name: string;
  content: string;
}

export interface InputFooterProps {
  id?: string;
  onSendMessage?: (message: string, file: FileAttachment | null) => void;
  disabled?: boolean;
  placeholder?: string;
  allowFileUpload?: boolean;
}

export interface AdvanceFooterProps {
  id?: string;
  onAdvance: () => void;
  currentMessageIndex: number;
  totalMessages: number;
  disabled?: boolean;
}

export interface ChatComponentProps {
  id: string;
  messages: ChatDisplayEntry[];
  /** Content namespace for markdown in messages (embedded ```olx fences
   *  parse here). The Chat block passes its runtime ns; the studio LLM
   *  sidebar passes the studio namespace. */
  ns: ContentNamespace;
  participants?: Cast | null;
  initialScrollPosition?: 'bottom' | 'top' | number;
  subtitle?: string | null;
  footer?: React.ReactNode;
  height?: string;
}

/* ----------------------------------------------------------------
 * Theme tokens
 * -------------------------------------------------------------- */

// Token-mapped CSS classes — dark mode handled automatically via CSS custom
// properties (--lo-* tokens).  To render this component on a dark/contrasting
// surface, scope `data-color-mode="dark"` on a parent container so that
// semantic tokens resolve to their dark-mode values.
const t = {
  container: 'border-border bg-background',
  header: 'bg-background border-border',
  headerText: 'text-secondary',
  headerSubtle: 'text-dimmed',
  content: 'bg-background',
  message: 'bg-muted',
  messageText: '',
  systemBg: 'bg-muted',
  systemText: 'text-dimmed',
  toolBg: 'bg-surface border-border hover:bg-muted',
  toolText: 'text-secondary',
  toolIcon: 'text-dimmed',
  inputBg: 'bg-surface border-border',
  inputField: 'bg-background border-border text-foreground',
  inputPlaceholder: 'placeholder:text-dimmed',
  button: 'bg-accent hover:bg-accent-hover text-inverse',
  buttonDisabled: 'bg-muted text-dimmed',
  fileBadge: 'bg-muted text-secondary',
  errorBadge: 'bg-error-subtle text-error',
};

/* ----------------------------------------------------------------
 * Internal message renderers
 * -------------------------------------------------------------- */

function ChatLine({ message, isSequential, participants, ns }: {
  message: ChatLineMessage;
  isSequential: boolean;
  participants: Cast | null;
  ns: ContentNamespace;
}) {
  const { avatar, name } = cast.avatar({}, {
    who: message.speaker,
    cast: participants ?? {},
    face: message.metadata?.face as FaceExpression | undefined,
  });

  return (
    <div className={`flex ${isSequential ? 'mt-1' : 'mt-4'}`}>
      {!isSequential ? (
        <div className="me-2 flex-shrink-0">
          {avatar}
        </div>
      ) : (
        <div className="w-10 flex-shrink-0"></div>
      )}
      <div className="flex flex-col">
        {!isSequential && (
          <span className={`text-sm font-semibold mb-1 ${t.headerText}`}>{name}</span>
        )}
        <div className={`${t.message} ${t.messageText} p-2 px-3 rounded-lg max-w-md`}>
          <RenderMarkdown ns={ns}>{message.text || ''}</RenderMarkdown>
        </div>
      </div>
    </div>
  );
}

function SystemMsg({ message }: { message: SystemMessageEntry }) {
  return (
    <div className="flex justify-center my-2">
      <span className={`text-xs ${t.systemText} ${t.systemBg} py-1 px-3 rounded-full`}>
        {message.text}
      </span>
    </div>
  );
}

function DateDivider({ message }: { message: DateSeparatorEntry }) {
  return (
    <div className="flex justify-center my-4">
      <span className={`text-xs ${t.systemText} ${t.systemBg} py-1 px-3 rounded-full`}>
        {message.date}
      </span>
    </div>
  );
}

function ToolCall({ message }: { message: ToolCallEntry }) {
  const [expanded, setExpanded] = useState(false);

  const synopsis = message.result || '(no result)';
  const truncatedSynopsis = synopsis.length > 80
    ? synopsis.slice(0, 80) + '...'
    : synopsis;

  return (
    <div className="my-2 mx-10">
      <div
        className={`text-xs ${t.toolBg} border rounded p-2 cursor-pointer`}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={t.toolIcon}>🔧</span>
        <span className="font-mono ms-1 text-accent">{message.name}</span>
        <span className={`${t.toolText} ms-2`}>{truncatedSynopsis}</span>
        <ExpandIcon expanded={expanded} className={`${t.headerSubtle} ms-2`} />
      </div>
      {expanded && (
        <div className={`mt-1 p-2 ${t.toolBg} border rounded text-xs font-mono overflow-x-auto`}>
          <div className={t.toolText}>Args:</div>
          <pre className={`${t.messageText} whitespace-pre-wrap`}>{JSON.stringify(message.args, null, 2)}</pre>
          <div className={`${t.toolText} mt-2`}>Result:</div>
          <pre className={`${t.messageText} whitespace-pre-wrap`}>{message.result}</pre>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * InputFooter
 * -------------------------------------------------------------- */

export const InputFooter: React.FC<InputFooterProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Type a message...',
  allowFileUpload = false,
}) => {
  const [message, setMessage] = useState('');
  const [attachedFile, setAttachedFile] = useState<FileAttachment | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if ((message.trim() || attachedFile) && !disabled && onSendMessage) {
      onSendMessage(message, attachedFile);
      setMessage('');
      setAttachedFile(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (message.trim() || attachedFile) && !disabled) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    try {
      const content = await file.text();
      setAttachedFile({ name: file.name, content });
    } catch {
      setFileError(`Failed to read ${file.name}`);
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  return (
    <div className={`${t.inputBg} p-3 border-t`}>
      {attachedFile && (
        <div className={`mb-2 flex items-center text-sm ${t.fileBadge} rounded px-2 py-1`}>
          <span className="me-2">📎</span>
          <span className="flex-1 truncate">{attachedFile.name}</span>
          <button
            className={`ms-2 ${t.headerSubtle} hover:text-error`}
            onClick={() => setAttachedFile(null)}
          >
            ✕
          </button>
        </div>
      )}
      {fileError && (
        <div className={`mb-2 flex items-center text-sm ${t.errorBadge} rounded px-2 py-1`}>
          <span className="flex-1">{fileError}</span>
          <button
            className="ms-2 hover:text-error"
            onClick={() => setFileError(null)}
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-center">
        {allowFileUpload && (
          <>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept={acceptString('uploadable')}
              onChange={handleFileSelect}
            />
            <button
              className={`me-2 p-2 rounded-full ${disabled ? `${t.headerSubtle} cursor-not-allowed` : `${t.toolIcon} hover:${t.message}`}`}
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              title="Attach file"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
          </>
        )}
        <input
          type="text"
          className={`flex-1 border rounded-full py-2 px-4 focus:outline-none ${t.inputField} ${t.inputPlaceholder} ${disabled ? 'opacity-50' : 'focus:ring-2 focus:ring-accent'}`}
          placeholder={disabled ? 'Observation mode' : placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          className={`ms-2 rounded-full p-2 ${disabled ? t.buttonDisabled + ' cursor-not-allowed' : t.button + ' focus:outline-none focus:ring-2 focus:ring-accent'}`}
          onClick={handleSend}
          disabled={disabled}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------
 * AdvanceFooter
 * -------------------------------------------------------------- */

export const AdvanceFooter: React.FC<AdvanceFooterProps> = ({
  onAdvance,
  currentMessageIndex,
  totalMessages,
  disabled = false,
}) => {
  return (
    <div className="bg-surface p-3 border-t border-border">
      <div className="flex items-center justify-between">
        <span className="text-sm text-dimmed">
          {currentMessageIndex} of {totalMessages}
        </span>
        <button
          onClick={onAdvance}
          disabled={disabled}
          className="
            bg-accent text-inverse px-4 py-2 rounded-lg flex items-center
            hover:bg-accent-hover
            focus:outline-none focus:ring-2 focus:ring-accent
            disabled:bg-muted disabled:text-dimmed disabled:cursor-not-allowed
            disabled:hover:bg-muted disabled:focus:ring-0
          "
        >
          Continue <NavArrow direction="forward" className="ms-1 w-4 h-4" />
        </button>
        <span className="w-24" /> {/* balance the counter on the left */}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------
 * ChatComponent
 * -------------------------------------------------------------- */

export function ChatComponent({
  id,
  messages,
  ns,
  participants = null,
  initialScrollPosition = 'bottom',
  subtitle = null,
  footer,
  height = 'h-96',
}: ChatComponentProps) {
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    if (initialScrollPosition === 'bottom') {
      el.scrollTop = el.scrollHeight;
    } else if (initialScrollPosition === 'top') {
      el.scrollTop = 0;
    } else if (typeof initialScrollPosition === 'number') {
      // Container-scoped, deliberately NOT scrollIntoView: that scrolls every
      // scrollable ancestor, including the page, which yanks the whole layout.
      const items = el.querySelectorAll<HTMLElement>('.message-item');
      const item = items[initialScrollPosition];
      if (item) el.scrollTop = item.offsetTop - el.offsetTop;
    }
  }, [initialScrollPosition]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const renderMessage = (message: ChatDisplayEntry, index: number) => {
    const prev = index > 0 ? messages[index - 1] : null;
    const isSequential =
      prev?.type === 'Line' &&
      message.type === 'Line' &&
      prev.speaker === message.speaker;

    switch (message.type) {
      case 'Line':
        return (
          <div key={index} className="message-item">
            <ChatLine message={message} isSequential={isSequential} participants={participants ?? null} ns={ns} />
          </div>
        );
      case 'SystemMessage':
        return (
          <div key={index} className="message-item">
            <SystemMsg message={message} />
          </div>
        );
      case 'DateSeparator':
        return (
          <div key={index} className="message-item">
            <DateDivider message={message} />
          </div>
        );
      case 'ToolCall':
        return (
          <div key={index} className="message-item">
            <ToolCall message={message} />
          </div>
        );
      case 'Element':
        return (
          <div key={index} className="message-item my-4">
            {message.element}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col h-full border rounded-lg overflow-hidden ${t.container}`}>
      <div className={`p-3 border-b ${t.header}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className={`font-semibold ${t.headerText}`}>Chat</span>

            {/* HACK: suppressHydrationWarning because message count can differ
                between SSR (0 — Redux store not populated) and client (1+ — e.g.
                useChat initialMessage) -- or so we think. TODO: confirm and
                investigate proper SSR hydration. */}

            <span className={`ms-2 ${t.headerSubtle} text-sm`} suppressHydrationWarning>{messages.length} messages</span>
          </div>
          {subtitle && (
            <span className={`font-semibold text-sm ${t.headerText}`}>{subtitle}</span>
          )}
        </div>
      </div>
      <div
        ref={chatContainerRef}
        className={`overflow-y-auto p-4 ${t.content} ${height === 'flex-1' ? 'flex-1' : ''}`}
        style={height !== 'flex-1' ? { height } : undefined}
      >
        {messages.map(renderMessage)}
      </div>
      {footer}
    </div>
  );
}
