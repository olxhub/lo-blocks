// src/components/blocks/Chat/Chat.js

import { z } from 'zod';
import yaml from 'js-yaml';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes, cast } from '@/lib/blocks/attributeSchemas';
import { CHAT_METADATA_KEYS } from '@/lib/content/metadata';
import { CastSchema, withCastSupport } from '@/lib/cast';
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
 * After YAML parsing we validate the header structure. Cast members
 * are validated via CastSchema from cast.ts; other header keys are
 * checked against the known set.
 */

function validateHeader(header: Record<string, unknown>): string[] {
  const warnings: string[] = [];

  for (const key of Object.keys(header)) {
    if (!CHAT_METADATA_KEYS.has(key)) {
      warnings.push(`Unknown header key "${key}". Known keys: ${[...CHAT_METADATA_KEYS].join(', ')}`);
    }
  }

  // Validate cast via CastSchema
  if (header.cast) {
    const result = CastSchema.safeParse(header.cast);
    if (!result.success) {
      for (const issue of result.error.issues) {
        warnings.push(`Cast: ${issue.path.join('.')}: ${issue.message}`);
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
    } catch (e) {
      parsed.header = {};
      parsed.headerWarnings = [`YAML parse error in header: ${e.message}`];
    }
  }

  // Validate and attach warnings
  if (parsed.header && typeof parsed.header === 'object') {
    const warnings = validateHeader(parsed.header);
    if (warnings.length > 0) {
      parsed.headerWarnings = [...(parsed.headerWarnings || []), ...warnings];
    }
  }

  return { type: 'parsed', parsed };
}

const Chat = blocks.dev({
  ...withCastSupport(peggyParser(cp, { postprocess })),
  ...blocks.action({
    action: advanceChat
  }),
  name: 'Chat',
  component: _Chat,
  description: 'Example block that parses an SBA dialogue format using PEG.',
  fields,
  attributes: srcAttributes.extend({
    ...cast,
    clip: z.string().optional().describe('Clip range for dialogue section'),
    history: z.string().optional().describe('History clip range to show before current clip'),
    height: z.string().optional().describe('Container height (e.g., "400px" or "flex-1")'),
  }),
});

export default Chat;
