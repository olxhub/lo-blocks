import React from 'react';
import { dev } from '@/lib/blocks';
import { peggyParser } from '@/lib/olx/parsers';
import * as cp  from './_chatParser.js';
import { _Chat } from './_Chat';

const Chat = dev({
  name: 'Chat',
  component: _Chat,
  parser: peggyParser(cp),
  namespace: 'org.mitros.dev',
  description: 'Example block that parses an SBA dialogue format using PEG.'
});

export default Chat;
