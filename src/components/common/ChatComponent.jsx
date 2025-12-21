// src/components/common/ChatComponent.jsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronRight } from 'lucide-react';

// Generate random colors based on name (consistent for same name)
const getAvatarColor = (name) => {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
    'bg-purple-500', 'bg-pink-500', 'bg-indigo-500',
    'bg-red-500', 'bg-teal-500', 'bg-orange-500'
  ];

  // Simple hash function to get consistent color for same name
  const hash = Array.from(name).reduce(
    (acc, ch) => ch.charCodeAt(0) + ((acc << 5) - acc),
    0
  );

  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

// Avatar component
const Avatar = ({ name }) => {
  const initials = name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  const bgColor = getAvatarColor(name);

  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold ${bgColor}`}>
      {initials}
    </div>
  );
};

// Message component for chat lines
const ChatMessage = ({ message, isSequential }) => {
  return (
    <div className={`flex ${isSequential ? 'mt-1' : 'mt-4'}`}>
      {!isSequential ? (
        <div className="mr-2 flex-shrink-0">
          <Avatar name={message.speaker} />
        </div>
      ) : (
        <div className="w-10 flex-shrink-0"></div>
      )}
      <div className="flex flex-col">
        {!isSequential && (
          <span className="text-sm font-semibold mb-1">{message.speaker}</span>
        )}
        <div className="bg-gray-100 p-2 px-3 rounded-lg max-w-md">
          <ReactMarkdown>{message.text || ''}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

// System message component
const SystemMessage = ({ message }) => {
  return (
    <div className="flex justify-center my-2">
      <span className="text-xs text-gray-500 bg-gray-100 py-1 px-3 rounded-full">
        {message.text}
      </span>
    </div>
  );
};

// Date separator component
const DateSeparator = ({ message }) => {
  return (
    <div className="flex justify-center my-4">
      <span className="text-xs text-gray-500 bg-gray-100 py-1 px-3 rounded-full">
        {message.date}
      </span>
    </div>
  );
};

// Tool call component - shows what tool the LLM called
const ToolCallMessage = ({ message }) => {
  const [expanded, setExpanded] = useState(false);

  // Truncate result for synopsis display
  const synopsis = message.result || '(no result)';
  const truncatedSynopsis = synopsis.length > 80
    ? synopsis.slice(0, 80) + '...'
    : synopsis;

  return (
    <div className="my-2 mx-10">
      <div
        className="text-xs bg-gray-50 border border-gray-200 rounded p-2 cursor-pointer hover:bg-gray-100"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-gray-500">🔧</span>
        <span className="font-mono ml-1 text-blue-600">{message.name}</span>
        <span className="text-gray-600 ml-2">{truncatedSynopsis}</span>
        <span className="text-gray-400 ml-2">{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-xs font-mono overflow-x-auto">
          <div className="text-gray-600">Args:</div>
          <pre className="text-gray-800 whitespace-pre-wrap">{JSON.stringify(message.args, null, 2)}</pre>
          <div className="text-gray-600 mt-2">Result:</div>
          <pre className="text-gray-800 whitespace-pre-wrap">{message.result}</pre>
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
}) => {
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
    <div className="bg-gray-50 p-3 border-t border-gray-200">
      {/* Show attached file */}
      {attachedFile && (
        <div className="mb-2 flex items-center text-sm text-gray-600 bg-gray-100 rounded px-2 py-1">
          <span className="mr-2">📎</span>
          <span className="flex-1 truncate">{attachedFile.name}</span>
          <button
            className="ml-2 text-gray-400 hover:text-red-500"
            onClick={() => setAttachedFile(null)}
          >
            ✕
          </button>
        </div>
      )}
      {/* Show file error */}
      {fileError && (
        <div className="mb-2 flex items-center text-sm text-red-600 bg-red-50 rounded px-2 py-1">
          <span className="flex-1">{fileError}</span>
          <button
            className="ml-2 text-red-400 hover:text-red-600"
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
              accept=".txt,.md,.olx,.xml,.json,.js,.jsx,.ts,.tsx,.css,.html,.py,.yaml,.yml,.pegjs,.chatpeg,.sortpeg"
              onChange={handleFileSelect}
            />
            <button
              className={`mr-2 p-2 rounded-full ${disabled ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
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
          className={`flex-1 border border-gray-300 rounded-full py-2 px-4 focus:outline-none ${disabled ? 'bg-gray-100 text-gray-500' : 'focus:ring-2 focus:ring-blue-500'}`}
          placeholder={disabled ? 'Observation mode' : placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={disabled}
        />
        <button
          className={`ml-2 rounded-full p-2 ${disabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500'}`}
          onClick={handleSend}
          disabled={disabled}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
    <div className="bg-gray-50 p-3 border-t border-gray-200">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {currentMessageIndex} of {totalMessages}
        </span>
        <button
          onClick={onAdvance}
          disabled={disabled}
          className="
            bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center
            hover:bg-blue-600
            focus:outline-none focus:ring-2 focus:ring-blue-500
            disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed
            disabled:hover:bg-gray-300 disabled:focus:ring-0
          "
        >
          Continue <ChevronRight className="ml-1 w-4 h-4" />
        </button>
        <span className="text-xs text-gray-400">or focus chat and press [space]</span>
      </div>
    </div>
  );
};

// Main Chat Component
export function ChatComponent({
  id,
  messages,
  initialScrollPosition = 'bottom',
  subtitle,
  footer,
  height = 'h-96',
  onAdvance,
}) {
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
            <ChatMessage message={message} isSequential={isSequential} />
          </div>
        );
      case 'SystemMessage':
        return (
          <div key={index} className="message-item">
            <SystemMessage message={message} />
          </div>
        );
      case 'DateSeparator':
        return (
          <div key={index} className="message-item">
            <DateSeparator message={message} />
          </div>
        );
      case 'ToolCall':
        return (
          <div key={index} className="message-item">
            <ToolCallMessage message={message} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-white p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="font-semibold">Chat</span>
            <span className="ml-2 text-gray-500 text-sm">{messages.length} messages</span>
          </div>
          {subtitle && (
            <span className="font-semibold text-sm text-gray-700">{subtitle}</span>
          )}
        </div>
      </div>
      <div
        ref={chatContainerRef}
        className={`overflow-y-auto p-4 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${height === 'flex-1' ? 'flex-1' : ''}`}
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
