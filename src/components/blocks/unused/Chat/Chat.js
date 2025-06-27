// src/components/blocks/Chat/Chat.js
import React from 'react';
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import * as cp  from './_chatParser.js';
import { _Chat } from './_Chat';

export const fields = state.fields([
  'index',           // pointer into the full body array
  'start',           // (future) id of first block to show
  'end',             // (future) id of last block to show

  'footerMode',
  'scrollPosition',

  'value'            // External. TODO: How should we handle these?
]);

const Chat = dev({
  ...peggyParser(cp),
  name: 'Chat',
  component: _Chat,
  namespace: 'org.mitros.dev',
  description: 'Example block that parses an SBA dialogue format using PEG.',
  fields
});

export default Chat;
