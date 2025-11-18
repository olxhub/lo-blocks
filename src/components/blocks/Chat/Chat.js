// src/components/blocks/Chat/Chat.js
import React from 'react';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import * as cp  from './_chatParser.js';
import { _Chat, callChatAdvanceHandler } from './_Chat';

export const fields = state.fields([
  'value',           // pointer into the full body array
]);

function advanceChat({ targetId }) {
  callChatAdvanceHandler(targetId);
}

const Chat = blocks.dev({
  ...peggyParser(cp),
  ...blocks.action({
    action: advanceChat
  }),
  name: 'Chat',
  component: _Chat,
  namespace: 'org.mitros.dev',
  description: 'Example block that parses an SBA dialogue format using PEG.',
  fields
});

export default Chat;
