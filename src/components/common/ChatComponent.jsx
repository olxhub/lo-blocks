// src/components/common/ChatComponent.jsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

// Generate random colors based on name (consistent for same name)
const getAvatarColor = (name) => {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
    'bg-purple-500', 'bg-pink-500', 'bg-indigo-500',
    'bg-red-500', 'bg-teal-500', 'bg-orange-500'
  ];

  // Simple hash function to get consistent color for same name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

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
          {message.text}
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

export const InputFooter = ({ onSendMessage, disabled = false, placeholder = 'Type a message...' }) => {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && message.trim() && !disabled) {
      handleSend();
    }
  };

  return (
    <div className="bg-gray-50 p-3 border-t border-gray-200">
      <div className="flex items-center">
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
export const AdvanceFooter = ({ onAdvance, currentMessageIndex, totalMessages }) => {
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === ' ') {
        onAdvance();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onAdvance]);

  return (
    <div className="bg-gray-50 p-3 border-t border-gray-200">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {currentMessageIndex} of {totalMessages}
        </span>
        <button
          onClick={onAdvance}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Continue <ChevronRight className="ml-1 w-4 h-4" />
        </button>
        <span className="text-xs text-gray-400">or press [space]</span>
      </div>
    </div>
  );
};

// Main Chat Component
export function ChatComponent({
  id,
  messages,
  initialScrollPosition = 'bottom',
  footer,
  height = 'h-96',
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
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-white p-3 border-b border-gray-200">
        <div className="flex items-center">
          <span className="font-semibold">Chat</span>
          <span className="ml-2 text-gray-500 text-sm">{messages.length} messages</span>
        </div>
      </div>
      <div
        ref={chatContainerRef}
        className={`${height} overflow-y-auto p-4 bg-white flex-1`}
      >
        {messages.map(renderMessage)}
      </div>
      {footer}
    </div>
  );
}
