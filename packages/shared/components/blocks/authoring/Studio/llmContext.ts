// packages/shared/components/blocks/authoring/Studio/llmContext.ts
//
// Context building for the studio LLM editor assistant. Ported from
// apps/web/app/studio/context.ts; the block list now comes from the
// get_blocks MCP tool (descriptor level) instead of the retired
// /api/docs REST route.
//
// NOTE: Currently using template literals for simplicity. If this grows to need
// loops, conditionals, or user-editable prompts, consider using lib/template
// or a proper templating system.

import { callMcpTool } from '@/lib/mcp/client';

/** The descriptor slice of a get_blocks result the prompt needs. */
interface BlockDescriptor {
  name: string;
  description: string | null;
  internal?: boolean;
}

/**
 * Get file type from path extension.
 */
export function getFileType(path: string | undefined | null): string {
  if (!path) return 'unknown';
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'olx' || ext === 'xml') return 'olx';
  return ext || 'unknown';
}

// Module-level cache: the block list is stable for the session (same
// lifetime the legacy /api/docs cache had). Failures are NOT cached so a
// transient error retries on the next send.
let cachedBlockList: BlockDescriptor[] | null = null;

/**
 * Fetch list of all blocks with short descriptions (descriptor level:
 * name + description; no heavy `include` facets).
 */
export async function fetchBlockList(): Promise<BlockDescriptor[]> {
  if (cachedBlockList) return cachedBlockList;
  try {
    const result = await callMcpTool<{ blocks: BlockDescriptor[] }>(
      'get_blocks', {}, { retry: true });
    cachedBlockList = result.blocks;
    return cachedBlockList;
  } catch (err) {
    console.error('Failed to fetch block list:', err);
    return [];
  }
}

/**
 * Format block list for prompt. Unfiltered get_blocks listings exclude
 * internal blocks by contract — no re-filtering here.
 */
export function formatBlockList(blocks: BlockDescriptor[]): string {
  return blocks
    .map(b => `- <${b.name}>: ${b.description || '(no description)'}`)
    .join('\n');
}

/**
 * Build the system prompt for the editor LLM.
 */
export async function buildSystemPrompt({ path, content }: {
  path: string | undefined;
  content: string | undefined;
}): Promise<string> {
  const blocks = await fetchBlockList();
  const blockList = formatBlockList(blocks);

  return `
You are an educational content authoring assistant for the lo-blocks system.

## Current File
Path: ${path || '(no file selected)'}
Type: ${getFileType(path)}

\`\`\`
${content || ''}
\`\`\`

## Available Blocks
${blockList}

## Tools
You can use these tools:
- Edit: Make changes to the current file using search-and-replace (applied immediately to the editor; the author saves)
- Read: Read another file from the content library
- Glob: Find files by pattern
- Grep: Search file contents
- Write: Create or overwrite a file (create: true refuses to clobber an existing file)
- Delete / Move: Delete or rename files
- OpenFile: Open a file in the editor
- get_blocks: Detailed docs for OLX blocks (filter by name; include readme/template/examples)
- get_formats: Docs for content formats (PEG grammars, YAML schemas)
`;
}
