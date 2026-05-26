// src/components/blocks/Chat/Chat.ts

import { z } from 'zod';
import yaml from 'js-yaml';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes, cast } from '@/lib/blocks/attributeSchemas';
import { CHAT_METADATA_KEYS } from '@/lib/content/metadata';
import { parseXmlFragment } from '@/lib/content/parseOLX';
import { validateCast, withCastSupport } from '@/lib/avatar/cast';
import { advanceFrom } from '@/lib/advance';
import {
  selectReferences, createContext, extractStructuredRefs, mergeReferences, EMPTY_REFS,
  parse as parseExpr, evaluate,
} from '@/lib/stateLanguage';
import type { ConversationEntry, WaitCommand, ParsedConversation } from './_chatTypes';
import type { PeggyKids } from '@/lib/types';
import { canAdvanceToContent, evaluateWaitEntry } from './waitConditions';
import { scopedStateKeyForBlock, splitNs, asDefinitionRef, joinDefinitionRef, parseLeafId, qualifyDefinitionRef, parseDefinitionRef } from '@/lib/types/id-grammar';
import type { DefinitionKey, DefinitionRef, RuntimeProps } from '@/lib/types';
import * as cp from './_chatParser';
import { _Chat } from './_Chat';

import * as chatUtils from './chatUtils';

export const fields = state.fields([
  'value',           // pointer into the full body array
  'isDisabled',
  'sectionHeader',
  'ignoreWaits',     // instructor mode: treat all wait conditions as satisfied
]);

/* ----------------------------------------------------------------
 * Advance / canAdvance — blueprint functions for the advance system.
 *
 * These are pure functions called by lib/advance.ts tree walker.
 * They read state via fieldSelector/selectReferences and write
 * via updateField — no React hooks.
 * -------------------------------------------------------------- */

/** Extract parsed body and clip range from Chat props. */
function getState(props: RuntimeProps, reduxState: any) {
  const parsed = (props.kids as unknown as PeggyKids<ParsedConversation>).parsed;
  const allEntries = parsed.body;

  // Compute clip range
  let clipStart = 0;
  let clipEnd = allEntries.length - 1;
  if (props.clip) {
    try {
      const range = chatUtils.clip({ body: allEntries }, props.clip);
      clipStart = range.start;
      clipEnd = range.end;
    } catch { /* invalid clip — treat as full range */ }
  }

  // Compute history start
  let historyStart = clipStart;
  if (props.history) {
    try {
      const range = chatUtils.clip({ body: allEntries }, props.history);
      historyStart = Math.min(range.start, clipStart);
    } catch { /* invalid history — ignore */ }
  }

  // Read current index from Redux
  const index = state.fieldSelector(reduxState, props, fields.value, { fallback: clipStart });
  const windowedIndex = Math.max(clipStart, Math.min(index, clipEnd));

  // Instructor mode: ignore wait conditions (requires both the per-block
  // toggle and the global instructor mode setting to be active)
  const instructorMode = state.fieldSelector(reduxState, null, state.settings.instructorMode, { fallback: false });
  const ignoreWaits = instructorMode && state.fieldSelector(reduxState, props, fields.ignoreWaits, { fallback: false });

  // Build wait condition context
  const allRefs = extractWaitRefs(allEntries);
  const resolved = selectReferences(reduxState, props, allRefs);
  const waitContext = createContext(resolved);

  return { allEntries, clipStart, clipEnd, windowedIndex, waitContext, ignoreWaits };
}

/** Extract all wait command references from entries. */
function extractWaitRefs(entries: ConversationEntry[]) {
  const expressions: string[] = [];
  for (const entry of entries) {
    if (entry.type === 'WaitCommand' && entry.expression) {
      expressions.push(entry.expression);
    }
  }
  if (expressions.length === 0) return EMPTY_REFS;
  return mergeReferences(...expressions.map(extractStructuredRefs));
}

function canAdvance(props: RuntimeProps, reduxState: any): boolean {
  const { windowedIndex, clipEnd } = getState(props, reduxState);
  return windowedIndex < clipEnd;
}

function advance(props: RuntimeProps, reduxState: any): boolean {
  const { allEntries, windowedIndex, clipEnd, waitContext, ignoreWaits } = getState(props, reduxState);

  // Conversation finished
  if (windowedIndex >= clipEnd) return false;

  // Check if next content is reachable (may be blocked by wait)
  if (!ignoreWaits && !canAdvanceToContent(allEntries, windowedIndex, clipEnd, waitContext)) {
    return true; // blocked on wait — still active, don't let parent advance past us
  }

  // Step through entries, executing commands and stopping at content
  let nextIndex = windowedIndex;
  while (nextIndex < clipEnd) {
    const block = allEntries[nextIndex + 1];
    if (!block) break;

    switch (block.type) {
      case 'ArrowCommand':
        state.updateField(props, fields.value, block.target, {
          stateKey: scopedStateKeyForBlock({ ...props, id: block.source as DefinitionRef }),
        });
        nextIndex += 1;
        continue;

      case 'WaitCommand':
        if (!ignoreWaits && !evaluateWaitEntry(block, waitContext)) {
          state.updateField(props, fields.value, Math.min(nextIndex, clipEnd));
          return true; // blocked — still active
        }
        nextIndex += 1;
        continue;

      case 'SectionHeader':
        state.updateField(props, fields.sectionHeader, block.title);
        nextIndex += 1;
        continue;

      case 'Line':
      case 'PauseCommand':
      case 'EmbedCommand':
        nextIndex += 1;
        state.updateField(props, fields.value, Math.min(nextIndex, clipEnd));
        return true;

      default:
        console.warn('[Chat] Unhandled entry type:', block.type, block);
        nextIndex += 1;
        break;
    }
  }

  state.updateField(props, fields.value, Math.min(nextIndex, clipEnd));
  return nextIndex < clipEnd;
}

/* ----------------------------------------------------------------
 * Instructor mode helper — autoadvance for content review.
 *
 * Called from the instructor toolbar in _Chat.tsx.  Single-step
 * ignore-waits is handled by advance() reading fields.ignoreWaits.
 * -------------------------------------------------------------- */

/**
 * THIS IS A BIT OF A HACK
 *
 * Advance the entire chat to the end in a single pass.
 *
 * Unlike advance (which pauses at each content entry), this walks
 * all entries from the current position to clipEnd, executing side
 * effects (arrow commands, section headers) and skipping waits. Only
 * the final index is written to Redux, avoiding per-step dispatches.
 *
 * HACK: UseHistory currently picks up intermediate arrow command
 * values because React re-renders between synchronous dispatches
 * (likely due to lo_event). This is not guaranteed in the future. If
 * UseHistory stops building full history, convert this to an async
 * loop with requestAnimationFrame yielding.
 */
function autoadvance(props: RuntimeProps): void {
  const { allEntries, windowedIndex, clipEnd } = getState(props, props.runtime.store.getState());
  if (windowedIndex >= clipEnd) return;

  for (let i = windowedIndex + 1; i <= clipEnd; i++) {
    const entry = allEntries[i];
    if (!entry) break;

    switch (entry.type) {
      case 'ArrowCommand':
        state.updateField(props, fields.value, entry.target, {
          stateKey: scopedStateKeyForBlock({ ...props, id: entry.source as DefinitionRef }),
        });
        break;
      case 'SectionHeader':
        state.updateField(props, fields.sectionHeader, entry.title);
        break;
      // WaitCommand, Line, PauseCommand, EmbedCommand — skip, no dispatch needed
    }
  }

  // Single write for final position
  state.updateField(props, fields.value, clipEnd);
}

/* ----------------------------------------------------------------
 * Action handler — targeted advance from ActionButton
 * -------------------------------------------------------------- */

// Action signature requires targetId but Chat advances itself, not a target.
function advanceChat({ props }: { targetId: DefinitionKey; props: RuntimeProps }) {
  advance(props, props.runtime.store.getState());
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

/**
 * Process inline OLX embed blocks in the chatpeg body.
 *
 * EmbedBlock entries contain raw OLX XML between :: fences. We parse them
 * via parseXmlFragment (shared with parseOLX) and run each root element
 * through the content pipeline via parseNode. The resulting blocks are
 * stored via storeEntry and the EmbedBlock entry is replaced with an
 * EmbedCommand pointing at the generated block.
 */
async function processEmbedBlocks(
  body: ConversationEntry[],
  parseNode: (node: any, siblings: any[] | null, index: number) => Promise<any>,
  storeEntry: (id: DefinitionRef, entry: any) => void,
): Promise<string[]> {
  const warnings: string[] = [];

  for (let i = 0; i < body.length; i++) {
    const entry = body[i];
    if (entry.type !== 'EmbedBlock') continue;

    try {
      const rootNodes = parseXmlFragment(entry.content);

      if (rootNodes.length === 0) {
        warnings.push(`EmbedBlock at position ${i}: no valid XML elements found`);
        continue;
      }

      if (rootNodes.length > 1) {
        warnings.push(`EmbedBlock at position ${i}: multiple root elements found (only the first will be used). Wrap in a <Vertical> to include all.`);
      }

      const result = await parseNode(rootNodes[0], rootNodes, 0);

      if (result?.id) {
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
// Typed child-role suffix for joinDefinitionRef.
const POPOUT = parseLeafId('popout');

async function postprocess({ parsed, parseNode, storeEntry, id }: {
  parsed: any;
  parseNode?: (node: any, siblings: any[] | null, index: number) => Promise<any>;
  storeEntry: (id: DefinitionRef, entry: any) => void;
  id: DefinitionKey;
  [key: string]: any;
}) {
  const parentRef = asDefinitionRef(splitNs(id).path);
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

    // Qualify bare EmbedCommand refs with the parent's namespace.
    // PEG produces bare refs (e.g. "my_quiz"); idMap is keyed by qualified
    // DefinitionKeys (e.g. "CONTENT/my_quiz"). Qualify here so staticKids
    // and runtime rendering see consistent keys.
    const ns = splitNs(id).ns;
    for (const entry of parsed.body) {
      if (entry.type === 'EmbedCommand' && entry.ref) {
        entry.ref = qualifyDefinitionRef(parseDefinitionRef(entry.ref), ns);
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
        const wrapperId = joinDefinitionRef(parentRef, POPOUT, popoutIndex++);
        storeEntry(wrapperId, {
          id: wrapperId,
          tag: 'CompactPopout',
          attributes: { id: wrapperId, label, mode: 'target', autoOpen: true, target, targetContent: entry.ref },
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
      const wrapperId = joinDefinitionRef(parentRef, POPOUT, popoutIndex++);
      storeEntry(wrapperId, {
        id: wrapperId,
        tag: 'CompactPopout',
        attributes: { id: wrapperId, label, mode: display, autoOpen: true },
        kids: [{ type: 'block', id: entry.ref }],
      });
      entry.ref = wrapperId;
    }
  }

  return { type: 'parsed', parsed };
}

/**
 * Static kids function for Chat block.
 *
 * Extracts all EmbedCommand block IDs from the parsed conversation so the
 * server can preload them when fetching the Chat block.
 *
 * @param olxJson - The OlxJson entry for the Chat block
 * @returns Array of block IDs that are embedded in the conversation
 */
function staticKids(olxJson: any): string[] {
  const kids = olxJson.kids as PeggyKids<ParsedConversation> | undefined;
  if (!kids?.parsed?.body) return [];

  const ids: string[] = [];
  for (const entry of kids.parsed.body) {
    if (entry.type === 'EmbedCommand' && entry.ref) {
      ids.push(entry.ref);
    }
  }
  return ids;
}

const Chat = blocks.dev({
  ...withCastSupport(peggyParser(cp, { postprocess })),
  ...blocks.action({
    action: advanceChat
  }),
  grammars: ['chatpeg', 'clippeg'],
  name: 'Chat',
  component: _Chat,
  description: 'Example block that parses an SBA dialogue format using PEG.',
  fields,
  advance,
  canAdvance: canAdvance,
  staticKids: staticKids,
  locals: { autoadvance },
  attributes: srcAttributes.extend({
    ...cast,
    clip: z.string().optional().describe('Clip range for dialogue section'),
    history: z.string().optional().describe('History clip range to show before current clip'),
    height: z.string().optional().describe('Container height (e.g., "400px" or "flex-1")'),
  }),
});

export default Chat;
