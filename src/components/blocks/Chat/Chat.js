// src/components/blocks/Chat/Chat.js
import React from 'react';
import * as blocks from '@/lib/blocks';
import { peggyParser } from '@/lib/olx/parsers';
import * as cp  from './_chatParser.js';
import { _Chat } from './_Chat';

export const fields = blocks.fields([
  'start',
  'end',
  'index',

  'footerMode',
  'scrollPosition'
]);

const Chat = blocks.dev({
  ...peggyParser(cp),
  name: 'Chat',
  component: _Chat,
  namespace: 'org.mitros.dev',
  description: 'Example block that parses an SBA dialogue format using PEG.'
});

export default Chat;
