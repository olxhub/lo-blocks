// packages/shared/components/blocks/authoring/Studio/llmTools.ts
//
// Studio's 'studio-editor' toolset on the browser tool plane
// (lib/mcp/browserTools). Only what is genuinely editor-local lives here:
//   Edit     — search-and-replace on the OPEN BUFFER (unsaved content the
//              server can't see), validated client-side before applying.
//              Shadows the server's Edit: in Studio's chat, "edit" means
//              the buffer, and the author saves.
//   OpenFile — navigate the editor to a file.
//
// Everything else (Read/Glob/Grep/Write/Delete/Move, block docs) is the
// server's MCP tools — the same tools external agents use. Studio's chat
// itself is a <Chat> block instance (see _Studio.tsx) whose >>> llm
// interlude names its toolsets; this module just keeps the editor-local
// tools registered and their context current.

import { z } from 'zod';
import { parseOLX } from '@/lib/content/parseOLX';
import { isPEGContentExtension, getParserForExtension } from '@/generated/parserRegistry';
import { registerClientTool } from '@/lib/mcp/browserTools';
import { callMcpTool } from '@/lib/mcp/client';
import { toLofsRef } from '@/lib/types/address';
import { asContentNamespace } from '@/lib/types/id-grammar';
import type { LofsOrigin } from '@/lib/types';

/** Synthetic namespace for validation-only parses of editor buffers —
 *  nothing from these parses is stored or rendered. */
const EDITOR_VALIDATION_NS = asContentNamespace('studio');

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// =============================================================================
// Live editor context — the seam between the registered tools (stable,
// module-lifetime) and the component's per-render callbacks. The chat
// updates it at send time; handlers read through it.
// =============================================================================

export interface EditorBufferHandle {
  /** Current buffer content (read at call time — no stale closures). */
  getCurrentContent: () => string;
  /** Current file type, e.g. 'olx', 'chatpeg'. */
  getFileType: () => string;
  /** Apply an edited buffer back to the editor. */
  onApplyEdit?: (content: string) => void;
  /** Navigate the editor to a file. */
  onOpenFile?: (path: string) => void;
  /** The source Studio is editing — bound into server content tools. */
  source?: LofsOrigin;
}

let ctx: EditorBufferHandle | null = null;
let registered = false;

/** Validate buffer content by parsing (OLX via parseOLX, PEG formats via
 *  their generated parser). Throws an author-friendly error when invalid. */
async function validateBuffer(fileType: string, content: string): Promise<void> {
  if (fileType === 'olx' || fileType === 'xml') {
    const { errors } = await parseOLX(content, [toLofsRef('editor://')], undefined, EDITOR_VALIDATION_NS);
    if (errors.length > 0) {
      const messages = errors.map((e: { message: string }) => e.message).join('\n\n---\n\n');
      throw new Error(`(${errors.length} issue${errors.length > 1 ? 's' : ''}):\n\n${messages}`);
    }
  } else if (isPEGContentExtension(fileType)) {
    const parser = getParserForExtension(fileType);
    if (parser) {
      try {
        parser.parse(content);
      } catch (err) {
        const loc = (err as { location?: { start?: { line: number; column: number } } }).location?.start;
        const locStr = loc ? ` (line ${loc.line}, col ${loc.column})` : '';
        throw new Error(`${locStr}: ${errMessage(err)}`.trim());
      }
    }
  }
}

function registerStudioTools(): void {
  if (registered) return;
  registered = true;

  registerClientTool('Edit', {
    description:
      'Edit the CURRENT OPEN FILE using search-and-replace (applied to the editor buffer ' +
      'immediately; the author saves). old_string must be unique in the file — include ' +
      'surrounding context if needed. Use replace_all: true for global renames.',
    input: z.object({
      old_string: z.string().describe('Exact text to find and replace. Must be unique unless replace_all is true.'),
      new_string: z.string().describe('Replacement text.'),
      replace_all: z.boolean().optional().describe('If true, replace ALL occurrences. Default: false.'),
    }),
    output: z.string(),
  }, async ({ old_string, new_string, replace_all = false }) => {
    if (!ctx) throw new Error('Editor not available.');
    if (!old_string || old_string.trim() === '') {
      throw new Error('old_string cannot be empty.');
    }
    const currentContent = ctx.getCurrentContent();
    const occurrences = currentContent.split(old_string).length - 1;
    if (occurrences === 0) {
      throw new Error('Could not find text to replace. Ensure old_string exactly matches.');
    }
    if (occurrences > 1 && !replace_all) {
      throw new Error(`Found ${occurrences} occurrences. Include more context to make unique, or set replace_all: true.`);
    }
    const newContent = replace_all
      ? currentContent.replaceAll(old_string, new_string)
      : currentContent.replace(old_string, new_string);
    await validateBuffer(ctx.getFileType(), newContent);
    ctx.onApplyEdit?.(newContent);
    return replace_all ? `Replaced ${occurrences} occurrences` : 'Edit applied';
  }, ['studio-editor']);

  registerClientTool('OpenFile', {
    description: 'Open a file in the editor. Use after creating a new file, or when asked to open/show a file.',
    input: z.object({
      file_path: z.string().describe('Path to the file to open'),
    }),
    output: z.string(),
  }, async ({ file_path }) => {
    if (!ctx?.onOpenFile) throw new Error('Cannot open file: editor integration not available.');
    // Verify it exists (same Read the LLM would use) before navigating.
    await callMcpTool('Read', ctx.source ? { path: file_path, source: ctx.source } : { path: file_path });
    ctx.onOpenFile(file_path);
    return `Opened: ${file_path}`;
  }, ['studio-editor']);
}

// =============================================================================
// Binding — Studio keeps the editor context current; the chat block's
// interlude pulls the 'studio-editor' toolset from the tool plane.
// =============================================================================

/**
 * Register Studio's editor-local tools (once) and update the live context
 * they read through. Call on every render whose deps touch the editor —
 * cheap after the first call.
 */
export function bindStudioEditorTools(context: EditorBufferHandle): void {
  ctx = context;
  registerStudioTools();
}
