// src/components/blocks/Chat/_Chat.jsx
'use client';

import React from 'react';

import { useReduxState } from '@/lib/blocks';
import { ChatComponent, InputFooter, AdvanceFooter } from '@/components/common/ChatComponent';

// Display components moved to ChatComponent.jsx

// This will be the redux state wrapper for ChatComponet
export function _Chat( props ) {
  const { id, fields, kids } = props;
  const allMessages = kids.parsed.body;
  const [visibleCount, setVisibleCount] = useReduxState(props, fields.index, 1);
  const messages = allMessages.slice(0, visibleCount);
  const handleAdvance = () => setVisibleCount(Math.min(visibleCount + 1, allMessages.length));

  let footer;

  if(visibleCount === allMessages.length) {
    footer = (<InputFooter id={`${id}_footer`} disabled />);
  } else {
    footer = (
      <AdvanceFooter
        id={`${id}_footer`}
        onAdvance={handleAdvance}
        currentMessageIndex={ visibleCount }
        totalMessages={ allMessages.length }
      />
    );
  }
  /* Or:
    <InputFooter
    id={`${id}Input`}
    onSendMessage={onSendMessage} />
  */

  return (
    <ChatComponent
      id={ `${id}_component` }
      messages={ messages }
      footer={ footer }
      onAdvance = { handleAdvance }
    />
  );
}
