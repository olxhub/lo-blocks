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

/* ----------------------------------------------------------------
 * Header validation
 * ----------------------------------------------------------------
 * After YAML parsing we check for case-sensitivity typos so that
 * content authors get early feedback (e.g. "Seed" instead of "seed").
 */

const KNOWN_HEADER_KEYS = new Map([
  ['title', 'Title'],
  ['author', 'Author'],
  ['course', 'Course'],
  ['cast', 'Cast'],
]);

const KNOWN_CAST_KEYS = new Set([
  'seed', 'style', 'src', 'name',
  // DiceBear Open Peeps options
  'face', 'head', 'skinColor', 'clothingColor',
  'accessories', 'facialHair', 'mask',
]);

function validateHeader(header: Record<string, unknown>): string[] {
  const warnings: string[] = [];

  for (const key of Object.keys(header)) {
    const canonical = KNOWN_HEADER_KEYS.get(key.toLowerCase());
    if (canonical && canonical !== key) {
      warnings.push(`Header key "${key}" should be "${canonical}" (keys are case-sensitive)`);
    }
  }

  // Find Cast (case-insensitive) and validate property keys
  const participantsKey = Object.keys(header).find(k => k.toLowerCase() === 'cast');
  const participants = participantsKey ? header[participantsKey] : null;

  if (participants && typeof participants === 'object' && !Array.isArray(participants)) {
    for (const [speaker, props] of Object.entries(participants as Record<string, unknown>)) {
      if (props && typeof props === 'object' && !Array.isArray(props)) {
        for (const propKey of Object.keys(props as Record<string, unknown>)) {
          const match = [...KNOWN_CAST_KEYS].find(k => k.toLowerCase() === propKey.toLowerCase());
          if (match && match !== propKey) {
            warnings.push(`Participant "${speaker}": "${propKey}" should be "${match}" (keys are case-sensitive)`);
          }
        }
      }
    }
  }

  return warnings;
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

  // Validate and attach warnings
  if (parsed.header && typeof parsed.header === 'object') {
    const warnings = validateHeader(parsed.header);
    if (warnings.length > 0) {
      parsed.headerWarnings = warnings;
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
