// src/components/blocks/Chat/Chat.js

import { z } from 'zod';
import yaml from 'js-yaml';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes, cast } from '@/lib/blocks/attributeSchemas';
import { CHAT_METADATA_KEYS } from '@/lib/content/metadata';
import { validateCast, withCastSupport } from '@/lib/avatar/cast';
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

  // Validate cast via CastSchema — throws on invalid data (fail fast).
  // Case-sensitivity hints are returned as non-fatal warnings.
  if (header.cast) {
    const { cast, warnings: castWarnings } = validateCast(header.cast);
    header.cast = cast;
    warnings.push(...castWarnings);
  }

  return warnings;
}

/**
 * Parse EmbedCommand YAML options into objects.
 *
 * Chatpeg embed syntax allows YAML options on indented lines after the ref:
 *
 *   ::video_1
 *     fullscreen: true
 *     label: Watch this video
 *
 * The grammar captures this as a raw string in `options`.  Here we parse it
 * into a Record and merge with the inline [key=value] metadata to form the
 * entry's `parsedOptions`.
 */
function parseEmbedOptions(body: any[]): string[] {
  const warnings: string[] = [];
  for (const entry of body) {
    if (entry.type !== 'EmbedCommand' || !entry.options) continue;
    try {
      const opts = yaml.load(entry.options);
      entry.parsedOptions = (opts && typeof opts === 'object') ? opts : {};
    } catch (e: any) {
      warnings.push(`YAML parse error in embed options for ::${entry.ref}: ${e.message}`);
      entry.parsedOptions = {};
    }
  }
  return warnings;
}

/**
 * Post-process PEG output: parse header text as YAML, parse embed options.
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

  // Parse YAML options on embed commands
  if (parsed.body) {
    const embedWarnings = parseEmbedOptions(parsed.body);
    if (embedWarnings.length > 0) {
      parsed.headerWarnings = [...(parsed.headerWarnings || []), ...embedWarnings];
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
