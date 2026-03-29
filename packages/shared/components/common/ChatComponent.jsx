// src/components/common/ChatComponent.jsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import NavArrow from '@/components/common/NavArrow';
import ExpandIcon from '@/components/common/ExpandIcon';
import * as cast from '@/lib/avatar/cast';
import { acceptString } from '@/lib/util/fileTypes';

// Theme definitions — token-mapped classes handle dark mode via CSS custom properties.
// The dark theme is no longer needed; both 'light' and 'dark' keys resolve to the same
// token set so that existing theme={} props keep working without breaking callers.
const tokenTheme = {
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

const themes = {
  light: tokenTheme,
  dark: tokenTheme,
};

// Message component for chat lines
const ChatMessage = ({ message, isSequential, theme, participants }) => {
  const t = themes[theme] || themes.light;

  const { avatar, name } = cast.avatar({}, {
    who: message.speaker,
    cast: participants ?? {},
    face: message.metadata?.face,
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
          <ReactMarkdown>{message.text || ''}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

// System message component
const SystemMessage = ({ message, theme }) => {
  const t = themes[theme] || themes.light;
  return (
    <div className="flex justify-center my-2">
      <span className={`text-xs ${t.systemText} ${t.systemBg} py-1 px-3 rounded-full`}>
        {message.text}
      </span>
    </div>
  );
};

// Date separator component
const DateSeparator = ({ message, theme }) => {
  const t = themes[theme] || themes.light;
  return (
    <div className="flex justify-center my-4">
      <span className={`text-xs ${t.systemText} ${t.systemBg} py-1 px-3 rounded-full`}>
        {message.date}
      </span>
    </div>
  );
};

// Tool call component - shows what tool the LLM called
const ToolCallMessage = ({ message, theme }) => {
  const [expanded, setExpanded] = useState(false);
  const t = themes[theme] || themes.light;

  // Truncate result for synopsis display
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
};

export const InputFooter = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Type a message...',
  allowFileUpload = false,
  theme = 'light',
}) => {
  const t = themes[theme];
  const [message, setMessage] = useState('');
  const [attachedFile, setAttachedFile] = useState(null); // { name, content }
  const [fileError, setFileError] = useState(null);
  const fileInputRef = useRef(null);

  const handleSend = () => {
    if ((message.trim() || attachedFile) && !disabled) {
      // Send message with optional file attachment
      // File content is passed separately, not embedded in message text
      onSendMessage(message, attachedFile);
      setMessage('');
      setAttachedFile(null);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && (message.trim() || attachedFile) && !disabled) {
      handleSend();
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);
    try {
      const content = await file.text();
      setAttachedFile({ name: file.name, content });
    } catch (err) {
      setFileError(`Failed to read ${file.name}`);
    }

    // Reset input so same file can be selected again
    e.target.value = '';
  };

  return (
    <div className={`${t.inputBg} p-3 border-t`}>
      {/* Show attached file */}
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
      {/* Show file error */}
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
        {/* File upload (when enabled) */}
        {allowFileUpload && (
          <>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept={acceptString('uploadable')} // .olx,.xml,.md,.chatpeg,.sortpeg,.js,.jsx,...
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
          onKeyPress={handleKeyPress}
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

// Continue/Advance Footer Component
export const AdvanceFooter = ({ onAdvance, currentMessageIndex, totalMessages, disabled=false }) => {
  // No global key listeners — advancing is handled by the focused chat region.

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
        <span className="text-xs text-dimmed">or focus chat and press [space]</span>
      </div>
    </div>
  );
};

// Main Chat Component
export function ChatComponent({
  id,
  messages,
  participants = null,
  initialScrollPosition = 'bottom',
  subtitle = null,
  footer,
  height = 'h-96',
  onAdvance = null,
  theme = 'light',
}) {
  const t = themes[theme];
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      if (initialScrollPosition === 'bottom') {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      } else if (initialScrollPosition === 'top') {
        chatContainerRef.current.scrollTop = 0;
      } else if (typeof initialScrollPosition === 'number') {
        const messageElements = chatContainerRef.current.querySelectorAll('.message-item');
        if (messageElements[initialScrollPosition]) {
          messageElements[initialScrollPosition].scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }, [initialScrollPosition]);

  // Always scroll to the bottom when new messages are added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages.length]);

  // Handle Space to advance only when this chat region (or its children) has focus.
  const handleKeyDown = useCallback(
    (e) => {
      if (!onAdvance) return;
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        onAdvance();
      }
    },
    [onAdvance]
  );

  const renderMessage = (message, index) => {
    const isSequential = index > 0 &&
      messages[index - 1].type === 'Line' &&
      messages[index - 1].speaker === message.speaker;

    switch (message.type) {
      case 'Line':
        return (
          <div key={index} className="message-item">
            <ChatMessage message={message} isSequential={isSequential} theme={theme} participants={participants} />
          </div>
        );
      case 'SystemMessage':
        return (
          <div key={index} className="message-item">
            <SystemMessage message={message} theme={theme} />
          </div>
        );
      case 'DateSeparator':
        return (
          <div key={index} className="message-item">
            <DateSeparator message={message} theme={theme} />
          </div>
        );
      case 'ToolCall':
        return (
          <div key={index} className="message-item">
            <ToolCallMessage message={message} theme={theme} />
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
            <span className={`ms-2 ${t.headerSubtle} text-sm`}>{messages.length} messages</span>
          </div>
          {subtitle && (
            <span className={`font-semibold text-sm ${t.headerText}`}>{subtitle}</span>
          )}
        </div>
      </div>
      <div
        ref={chatContainerRef}
        className={`overflow-y-auto p-4 ${t.content} focus:outline-none focus:ring-2 focus:ring-accent ${height === 'flex-1' ? 'flex-1' : ''}`}
        style={height !== 'flex-1' ? { height } : undefined}
        tabIndex={0}
        role="region"
        aria-label="Chat transcript. Press space to advance."
        onKeyDown={handleKeyDown}
      >
        {messages.map(renderMessage)}
      </div>
      {footer}
    </div>
  );
}
