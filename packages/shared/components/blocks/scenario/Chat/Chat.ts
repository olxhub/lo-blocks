// src/components/blocks/Chat/Chat.ts

import { z } from 'zod';
import yaml from 'js-yaml';
import { XMLParser } from 'fast-xml-parser';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes, cast } from '@/lib/blocks/attributeSchemas';
import { CHAT_METADATA_KEYS } from '@/lib/content/metadata';
import { transformTagName } from '@/lib/content/xmlTransforms';
import { validateCast, withCastSupport } from '@/lib/avatar/cast';
import type { ConversationEntry } from './_chatTypes';
import type { OlxKey, OlxReference } from '@/lib/types';
import * as cp  from './_chatParser';
import { _Chat, callChatAdvanceHandler } from './_Chat';

export const fields = state.fields([
  'value',           // pointer into the full body array
  'isDisabled',
  'sectionHeader'
]);

function advanceChat({ targetId }: { targetId: string }) {
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
function parseEmbedOptions(body: ConversationEntry[]): string[] {
  const warnings: string[] = [];
  for (const entry of body) {
    if (entry.type !== 'EmbedCommand' || !entry.options) continue;
    try {
      const opts = yaml.load(entry.options, { schema: yaml.JSON_SCHEMA });
      entry.parsedOptions = (opts && typeof opts === 'object') ? opts as Record<string, unknown> : {};
    } catch (e: any) {
      warnings.push(`YAML parse error in embed options for ::${entry.ref}: ${e.message}`);
      entry.parsedOptions = {};
    }
  }
  return warnings;
}

/* ----------------------------------------------------------------
 * Inline OLX parser for EmbedBlock
 * ----------------------------------------------------------------
 * EmbedBlock contains raw OLX XML between :: fences.  We parse it
 * using fast-xml-parser (same config as parseOLX) and run each root
 * element through the content pipeline via parseNode.  The resulting
 * blocks are stored via storeEntry and the EmbedBlock body entry is
 * replaced with an EmbedCommand pointing at the generated block.
 */

const embedXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  commentPropName: '#comment',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  transformTagName,
});

async function processEmbedBlocks(
  body: ConversationEntry[],
  parseNode: (node: any, siblings: any[] | null, index: number) => Promise<any>,
  storeEntry: (id: OlxKey, entry: any) => void,
): Promise<string[]> {
  const warnings: string[] = [];

  for (let i = 0; i < body.length; i++) {
    const entry = body[i];
    if (entry.type !== 'EmbedBlock') continue;

    try {
      const xmlContent = entry.content;
      const tree = embedXmlParser.parse(xmlContent);

      // Find the root element(s) in the parsed tree
      const elements = Array.isArray(tree) ? tree : [tree];
      const rootNodes = elements.filter(
        (node: any) => typeof node === 'object' && node !== null &&
          Object.keys(node).some((k: string) => k !== '#text' && k !== '#comment' && k !== ':@')
      );

      if (rootNodes.length === 0) {
        warnings.push(`EmbedBlock at position ${i}: no valid XML elements found`);
        continue;
      }

      if (rootNodes.length > 1) {
        warnings.push(`EmbedBlock at position ${i}: multiple root elements found (only the first will be used). Wrap in a <Vertical> to include all.`);
      }

      // Process the first root element through the full block pipeline.
      // parseNode calls the block's parser and storeEntry internally.
      const result = await parseNode(rootNodes[0], rootNodes, 0);

      if (result?.id) {
        // Replace EmbedBlock with EmbedCommand pointing at the parsed block
        body[i] = {
          type: 'EmbedCommand',
          ref: result.id,
          metadata: entry.metadata || {},
          options: null,
          parsedOptions: {},
        };
      } else {
        warnings.push(`EmbedBlock at position ${i}: parseNode returned no id`);
      }
    } catch (e: any) {
      warnings.push(`EmbedBlock at position ${i}: ${e?.message ?? String(e)}`);
    }
  }

  return warnings;
}

/**
 * Post-process PEG output: parse header text as YAML, parse embed options,
 * and process inline OLX embed blocks.
 *
 * The grammar returns header as raw text; we parse it here so the header
 * supports both simple key-value pairs and nested structures (e.g. participants).
 *
 * MUTATION CONTRACT: This function mutates `parsed` in place across three
 * passes: (1) parseEmbedOptions adds parsedOptions to EmbedCommand entries,
 * (2) processEmbedBlocks replaces EmbedBlock entries with EmbedCommands,
 * (3) the CompactPopout loop rewrites entry.ref for display-mode embeds.
 * This is safe because `parsed` is freshly produced by the PEG parser and
 * not yet stored or shared.
 */
async function postprocess({ parsed, parseNode, storeEntry, id }: {
  parsed: any;
  parseNode?: (node: any, siblings: any[] | null, index: number) => Promise<any>;
  storeEntry: (id: OlxKey, entry: any) => void;
  id: OlxKey;
  [key: string]: any;
}) {
  if (parsed.header && typeof parsed.header === 'string') {
    try {
      parsed.header = yaml.load(parsed.header, { schema: yaml.JSON_SCHEMA }) || {};
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

  if (parsed.body) {
    // Parse YAML options on embed commands
    const embedWarnings = parseEmbedOptions(parsed.body);
    if (embedWarnings.length > 0) {
      parsed.headerWarnings = [...(parsed.headerWarnings || []), ...embedWarnings];
    }

    // Process inline OLX embed blocks → block refs
    if (parseNode) {
      const blockWarnings = await processEmbedBlocks(parsed.body, parseNode, storeEntry);
      if (blockWarnings.length > 0) {
        parsed.headerWarnings = [...(parsed.headerWarnings || []), ...blockWarnings];
      }
    }

    // Process display= modes on embed commands.
    //   display=fullscreen/window → wrap in CompactPopout
    //   display=target:<id>       → set displayTarget for runtime repointing
    const VALID_DISPLAY_MODES = new Set(['fullscreen', 'window']);
    let popoutIndex = 0;
    for (const entry of parsed.body) {
      if (entry.type !== 'EmbedCommand') continue;
      const display = entry.metadata.display ?? entry.parsedOptions?.display;
      if (!display) continue;

      // target:<id> — repoint a component to show this embed
      if (typeof display === 'string' && display.startsWith('target:')) {
        const target = display.slice('target:'.length).trim();
        if (!target) {
          parsed.headerWarnings = [...(parsed.headerWarnings || []),
            `Empty target in display=target: on ::${entry.ref}`];
          continue;
        }
        const label = entry.metadata.label ?? entry.parsedOptions?.label ?? 'View expanded content';
        const wrapperId = `${id}_popout_${popoutIndex++}` as OlxKey;
        storeEntry(wrapperId, {
          id: wrapperId,
          tag: 'CompactPopout',
          attributes: { id: wrapperId, label, mode: 'target', target, targetContent: entry.ref },
          kids: [{ type: 'block', id: entry.ref }],
        });
        entry.ref = wrapperId;
        continue;
      }

      if (!VALID_DISPLAY_MODES.has(display as string)) {
        parsed.headerWarnings = [...(parsed.headerWarnings || []),
          `Unknown display mode "${display}" on ::${entry.ref}. Valid modes: ${[...VALID_DISPLAY_MODES].join(', ')}, target:<id>`];
        continue;
      }

      const label = entry.metadata.label ?? entry.parsedOptions?.label ?? 'View expanded content';
      const wrapperId = `${id}_popout_${popoutIndex++}` as OlxKey;
      storeEntry(wrapperId, {
        id: wrapperId,
        tag: 'CompactPopout',
        attributes: { id: wrapperId, label, mode: display },
        kids: [{ type: 'block', id: entry.ref }],
      });
      entry.ref = wrapperId;
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
