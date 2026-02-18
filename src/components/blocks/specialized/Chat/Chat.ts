// src/components/blocks/Chat/Chat.js

import { z } from 'zod';
import yaml from 'js-yaml';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import * as cp  from './_chatParser';
import { _Chat, callChatAdvanceHandler } from './_Chat';

export const fields = state.fields([
  'value',           // pointer into the full body array
  'isDisabled',
  'sectionHeader'
]);

function advanceChat({ targetId }) {
  callChatAdvanceHandler(targetId);
}

/**
 * Post-process PEG output: parse header text as YAML.
 * The grammar returns header as raw text; we parse it here so the header
 * supports both simple key-value pairs and nested structures (e.g. participants).
 */
function postprocess({ parsed, ...rest }) {
  if (parsed.header && typeof parsed.header === 'string') {
    try {
      parsed.header = yaml.load(parsed.header) || {};
    } catch {
      // If YAML parsing fails, fall back to empty header
      parsed.header = {};
    }
  }
  return { type: 'parsed', parsed };
}

const Chat = blocks.dev({
  ...peggyParser(cp, { postprocess }),
  ...blocks.action({
    action: advanceChat
  }),
  name: 'Chat',
  component: _Chat,
  description: 'Example block that parses an SBA dialogue format using PEG.',
  fields,
  attributes: srcAttributes.extend({
    clip: z.string().optional().describe('Clip range for dialogue section'),
    history: z.string().optional().describe('History clip range to show before current clip'),
    height: z.string().optional().describe('Container height (e.g., "400px" or "flex-1")'),
  }),
});

export default Chat;
