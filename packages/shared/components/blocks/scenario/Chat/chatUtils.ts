// packages/shared/components/blocks/scenario/Chat/chatUtils.ts
//
// Utilities for navigating chat transcripts: find by ID, extract sections,
// resolve clip ranges.  Used by _Chat.tsx for the clip= and history= attributes.

import { parse } from './_clipParser';
import type { ConversationEntry, SectionHeader, ParsedConversation } from './_chatTypes';

/* ─────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────── */

/** Minimal shape needed by these utilities — just the body array. */
interface ConversationBody {
  body: ConversationEntry[];
}

/** An inclusive index range into the conversation body. */
interface Range {
  start: number;
  end: number;
}

/** Result of clip resolution — a validated range with status. */
export interface ClipResult extends Range {
  valid: true;
  message: null;
}

/** Failed clip resolution — returned when the clip expression is invalid. */
export interface ClipError extends Range {
  valid: false;
  error: true;
  message: string;
  clip: string;
}

/** Either a successful or failed clip resolution. */
export type ClipResolution = ClipResult | ClipError;

/* ─── Clip parser AST (output of clip.pegjs) ─────────────────────── */

interface ClipNumber {
  type: 'number';
  value: number;
}

interface ClipIdentifier {
  type: 'identifier';
  value: string;
}

interface ClipQuoted {
  type: 'quoted';
  value: string;
}

interface ClipRange {
  type: 'range';
  open: '(' | '[';
  close: ')' | ']';
  start: ClipAST | null;
  end: ClipAST | null;
}

type ClipAST = ClipNumber | ClipIdentifier | ClipQuoted | ClipRange;

/* ─────────────────────────────────────────────────────────────────────
 * Lookup helpers
 * ───────────────────────────────────────────────────────────────────── */

/**
 * Find an element or section by ID.
 *
 * Returns:
 * - A Range if the ID belongs to a SectionHeader (the full section)
 * - A number (body index) if it's a regular element
 * - false if not found
 */
export function byId(conversation: ConversationBody, id: string): Range | number | false {
  const { body } = conversation;
  const idx = body.findIndex(line =>
    'metadata' in line && (line.metadata as Record<string, string>).id === id
  );
  if (idx === -1) return false;

  // If the ID belongs to a SectionHeader, return the full section range
  if (body[idx].type === 'SectionHeader') {
    return section(conversation, (body[idx] as SectionHeader).title) ?? false;
  }

  return idx;
}

/** List all SectionHeader entries in the conversation. */
export function listSections(conversation: ConversationBody): SectionHeader[] {
  return conversation.body.filter((line): line is SectionHeader => line.type === 'SectionHeader');
}

/** List all IDs found in metadata across all entries. */
export function listIds(conversation: ConversationBody): string[] {
  return conversation.body
    .map(line => 'metadata' in line ? (line.metadata as Record<string, string>).id : undefined)
    .filter((id): id is string => Boolean(id));
}

/**
 * Find a section by title.  Returns the inclusive body index range
 * from the SectionHeader to the entry before the next section (or end).
 */
export function section(conversation: ConversationBody, title: string): Range | null {
  const { body } = conversation;
  const start = body.findIndex(
    line => line.type === 'SectionHeader' && (line as SectionHeader).title.trim() === title.trim()
  );
  if (start === -1) return null;
  const next = body.slice(start + 1).findIndex(line => line.type === 'SectionHeader');
  const end = next === -1 ? body.length - 1 : start + next;
  return { start, end };
}

/** Throws with a diagnostic listing available sections and IDs. */
function throwUnknownRef(conversation: ConversationBody, value: string): never {
  const availableSections = listSections(conversation).map(s => s.title);
  const availableIds = listIds(conversation);
  throw Error(
    `Unknown section or ID: "${value}"\n` +
    `Available sections: ${availableSections.map(s => `"${s}"`).join(', ')}\n` +
    `Available IDs: ${availableIds.join(', ')}`
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Clip resolution
 * ───────────────────────────────────────────────────────────────────── */

/**
 * Resolve a clip AST node to a body index range.
 * Recursively handles numbers, identifiers, quoted strings, and ranges.
 */
function process(conversation: ConversationBody, ast: ClipAST | null): Range {
  if (ast === null) {
    return { start: NaN, end: NaN };
  }
  switch (ast.type) {
    case 'number':
      return { start: ast.value, end: ast.value };

    case 'identifier': {
      const idx = byId(conversation, ast.value);
      if (idx !== false) {
        if (typeof idx === 'object') return idx;
        return { start: idx, end: idx };
      }
      const sectionRange = section(conversation, ast.value);
      if (sectionRange) return sectionRange;

      throwUnknownRef(conversation, ast.value);
    }

    case 'quoted': {
      const sectionRange = section(conversation, ast.value);
      if (sectionRange) return sectionRange;
      const idx = byId(conversation, ast.value);
      if (idx !== false) {
        if (typeof idx === 'object') return idx;
        return { start: idx, end: idx };
      }

      throwUnknownRef(conversation, ast.value);
    }

    case 'range': {
      const startRange = process(conversation, ast.start);
      const endRange = process(conversation, ast.end);
      return {
        start: ast.open === '(' ? startRange.end + 1 : startRange.start,
        end: ast.close === ')' ? endRange.start - 1 : endRange.end,
      };
    }

    default:
      throw Error(`Unidentified clip AST type: ${(ast as any).type}`);
  }
}

/**
 * Resolve a clip expression string to a validated body index range.
 *
 * Clip syntax (parsed by clip.pegjs):
 *   "Introduction"       — section by title (quoted)
 *   Introduction         — section or ID (unquoted, sections checked first for IDs)
 *   greeting             — element by ID
 *   2                    — body index
 *   [0, 5]               — inclusive range
 *   (0, 5)               — exclusive range
 *   [0, 5)               — half-open range
 *   [intro, greeting]    — range between named references
 *   [1,]                 — from index 1 to end
 *   [,5]                 — from start to index 5
 *
 * Throws on unknown names (with available sections/IDs in the message),
 * invalid syntax, or inverted ranges (start > end).
 */
export function clip(conversation: ConversationBody, input: string): ClipResult {
  const body = conversation.body;

  let parsed: ClipAST;
  try {
    parsed = parse(input);
  } catch (parseError: any) {
    throw new Error(`Clip syntax error: ${parseError.message}\nInput: "${input}"`);
  }

  const processed = process(conversation, parsed);
  if (isNaN(processed.start)) processed.start = 0;
  if (isNaN(processed.end)) processed.end = body.length - 1;

  if (processed.start > processed.end) {
    throw new Error(`Invalid clip range (start ${processed.start} > end ${processed.end}): "${input}"`);
  }

  return {
    start: Math.max(processed.start, 0),
    end: Math.min(processed.end, body.length - 1),
    valid: true,
    message: null,
  };
}
