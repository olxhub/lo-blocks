// packages/shared/components/blocks/scenario/Chat/_chatTypes.ts
//
// Chatpeg AST types — produced by chat.pegjs, consumed by _Chat.tsx,
// waitConditions.ts, and chatUtils.ts.

import type { Cast } from '@/lib/avatar/types';
import type { DefinitionRef } from '@/lib/types';

/* ═══════════════════════════════════════════════════════════════════════════════
 * CHATPEG AST — Types produced by chat.pegjs
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A chatpeg document is a dialogue script: a YAML header followed by a body
 * of entries — spoken lines, flow-control commands, section markers, and
 * embedded blocks.  The PEG grammar (chat.pegjs) parses the text format;
 * Chat.ts post-processes the header YAML; _Chat.tsx renders the result.
 *
 * Example chatpeg source:
 *
 *   title: Study Group
 *   cast:
 *     Kim:
 *       seed: kim_01
 *       face: smile
 *   ~~~~
 *   Introduction [id=intro]
 *   -----------------------
 *   Kim: Did you read the Roediger study?
 *   Alex: The one about testing? [face=awe]
 *   Kim: Students who tested themselves remembered 50% more.
 *   --- wait @quiz.done ---
 *   ::reflection_prompt
 *
 * RELATIONSHIP TO KidEntry
 * ---------------------------------
 * Standard OLX blocks store children as KidEntry[] — a union of
 * { type: 'block' }, { type: 'text' }, { type: 'html' }, etc.  PEG-parsed
 * blocks like MarkupProblem use postprocess() to convert their AST into
 * KidEntry[] (see MarkupProblem.ts: storeEntry + blockRef).
 *
 * Chat's body entries serve the same role — they ARE the kids list — but
 * carry richer semantics (speaker, expression, section title) that don't
 * map to the existing KidEntry variants.  EmbedCommand is the
 * closest overlap: it's conceptually { type: 'block', id: ref } with
 * display metadata.
 *
 * Current: body entries are chat-specific types; postprocess wraps them
 * as { type: 'parsed', parsed: ParsedConversation }.
 *
 * Future: extend KidEntry with chat-specific variants so the
 * body IS a KidEntry[], and embed refs use the standard block
 * resolution machinery (storeEntry/blockRef pattern from MarkupProblem).
 */

/** Shared by entry types that carry [key=value] metadata from the grammar. */
export interface HasMetadata {
  metadata: Record<string, string>;
}

/**
 * A spoken line in the dialogue.
 *
 *   Kim: Did you read the Roediger study? [face=smile]
 *   Alex: This is a longer message that
 *   continues across multiple lines.
 *
 * Rich content (paragraphs, lists, tables) uses 2+ space indentation:
 *
 *   Kim: Here's the summary:
 *
 *     - Testing beats re-reading
 *     - Spacing beats cramming
 *
 * The `text` field contains the full markdown (inline + indented block
 * joined with \n\n).  ReactMarkdown renders it in the chat bubble.
 */
export interface DialogueLine extends HasMetadata {
  type: 'Line';
  speaker: string;
  text: string;
}

/**
 * A named section divider.  Organizes long scripts into navigable parts
 * and enables clip/history addressing.
 *
 *   Introduction [id=intro]
 *   -----------------------
 *
 * Title text followed by a line of 3+ dashes.  Optional [key=value]
 * metadata (commonly `id` for clip addressing).
 */
export interface SectionHeader extends HasMetadata {
  type: 'SectionHeader';
  title: string;
}

/**
 * Inserts a hard stop between commands that would otherwise execute together.
 * Rarely needed — the user already clicks Continue to advance dialogue.
 * Use only when consecutive commands must run sequentially with a user
 * confirmation in between.
 *
 *   sidebar <- intro_panel
 *   --- pause ---
 *   sidebar <- activity_panel
 */
export interface PauseCommand {
  type: 'PauseCommand';
}

/**
 * Blocks the dialogue until a state language expression is truthy.
 * Used to gate conversation on student activity (quiz completion,
 * text input, etc.).
 *
 *   --- wait @quiz.done ---
 *   --- wait @essay.value ---
 *   --- wait wordcount(@essay.value) >= 50 ---
 *
 * The expression is an unparsed state language string.  At runtime,
 * waitConditions.ts parses it via the state language module (producing
 * an ASTNode) and evaluates it against live component state.
 *
 * See: lib/stateLanguage/parser.ts for the expression grammar and
 *      ASTNode types (SigilRef, BinaryOp, Call, etc.)
 */
export interface WaitCommand {
  type: 'WaitCommand';
  expression: string;
}

/**
 * Repoints a dynamic component (e.g. UseHistory) to show different content.
 * Placed before the dialogue that references the new content.
 *
 *   sidebar <- summary
 *   Kim: Now look at the summary on the right.
 *
 * The left side is the destination being written; the arrow points into it
 * (assignment: `lhs <- value`). Scope is encoded by leading dots in the
 * source: a named `ref`, `self` (`.field`), or `parent` (`..field`). The
 * field defaults to `value` when omitted.
 *
 *   sidebar <- summary          → { scope:'ref', ref:'sidebar', field:'value', value:'summary' }
 *   item.target <- thing        → { scope:'ref', ref:'item', field:'target', value:'thing' }
 *   .mode <- chat               → { scope:'self', ref:null, field:'mode', value:'chat' }
 *   ..mode <- activity          → { scope:'parent', ref:null, field:'mode', value:'activity' }
 */
export interface SetField {
  type: 'SetField';
  scope: 'ref' | 'self' | 'parent';
  /** Block reference when scope is 'ref'; null for self/parent. */
  ref: DefinitionRef | null;
  field: string;
  value: string;
}

/**
 * A generic command (catch-all for future extensions).
 *
 *   --- someCommand args here ---
 */
export interface CommandBlock {
  type: 'CommandBlock';
  command: string;
}

/**
 * Embed a block by reference.  Conceptually equivalent to
 * KidEntry { type: 'block', id: ref } — an existing block
 * rendered inline in the conversation flow.
 *
 *   ::problem_1                               Simple reference
 *   ::video_1 [display=fullscreen]            With display hints
 *   ::video_1                                 With YAML options
 *     fullscreen: true
 *     label: Watch a video
 *
 * `ref` is an OLX block ID (like KidEntry.block.id).
 * `metadata` carries inline [key=value] pairs (display hints).
 * `options` is a raw YAML string from indented lines, or null.
 *
 * Display modes (set via [display=...] metadata):
 *   [display=fullscreen]       — wrap in CompactPopout (fullscreen modal)
 *   [display=window]           — wrap in CompactPopout (windowed modal)
 *   [display=target:sidebar]   — wrap in CompactPopout (repoints `sidebar`)
 *
 * All display modes wrap the embed in a CompactPopout via postprocess.
 * The CompactPopout handles the display behavior (modal vs repoint)
 * and shows a clickable placeholder in the chat flow.
 */
export interface EmbedCommand extends HasMetadata {
  type: 'EmbedCommand';
  ref: DefinitionRef;
  options: string | null;
  /** Parsed YAML options (set by postprocess in Chat.ts). */
  parsedOptions?: Record<string, unknown>;
}

/**
 * Embed literal OLX inline (fenced between :: markers).
 * The content is raw OLX XML to be parsed and rendered in place.
 *
 *   ::
 *   <MCQ id="quick_check">
 *     <Prompt>What is 2+2?</Prompt>
 *     <Key>4</Key>
 *   </MCQ>
 *   ::
 *
 * Unlike EmbedCommand (which references an existing block), this
 * defines a new block inline.  The content string needs OLX parsing
 * at render time — analogous to how MarkupProblem generates synthetic
 * child blocks via storeEntry() in postprocess.
 */
export interface EmbedBlock extends HasMetadata {
  type: 'EmbedBlock';
  ref: null;
  content: string;
}

/** All possible entries in a chatpeg body. */
export type ConversationEntry =
  | DialogueLine
  | SectionHeader
  | PauseCommand
  | WaitCommand
  | SetField
  | CommandBlock
  | EmbedCommand
  | EmbedBlock;

/**
 * Parsed YAML header.  Raw header text is parsed as YAML in Chat.ts
 * postprocess(), then validated (unknown keys warn, cast validated
 * via CastSchema).
 *
 * Header keys match OLX frontmatter conventions (see lib/content/metadata.ts).
 */
export interface ConversationHeader {
  title?: string;
  author?: string;
  description?: string;
  category?: string;
  cast?: Cast;
}

/**
 * Top-level output of the chatpeg pipeline:
 *   PEG grammar → raw AST → postprocess (YAML parse + validation)
 *
 * Stored as kids: { type: 'parsed', parsed: ParsedConversation }
 * via peggyParser() in Chat.ts.
 *
 * Note: header is always an object after postprocess — the raw grammar
 * may produce a string or null, but postprocess parses YAML and falls
 * back to {} on error.
 */
export interface ParsedConversation {
  type: 'Conversation';
  header: ConversationHeader;
  headerWarnings?: string[];
  body: ConversationEntry[];
}
