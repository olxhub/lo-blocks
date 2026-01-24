// src/lib/editor/context.js
//
// Context building for LLM editor assistant.
//
// NOTE: Currently using template literals for simplicity. If this grows to need
// loops, conditionals, or user-editable prompts, consider using src/lib/template
// or a proper templating system.
//

/**
 * Get file type from path extension.
 */
export function getFileType(path) {
  if (!path) return 'unknown';
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'olx' || ext === 'xml') return 'olx';
  return ext || 'unknown';
}

let cachedBlockList = null;

/**
 * Fetch list of all blocks with short descriptions.
 */
export async function fetchBlockList() {
  if (cachedBlockList) return cachedBlockList;

  const res = await fetch('/api/docs');
  if (!res.ok) return [];
  const data = await res.json();
  cachedBlockList = data.documentation.blocks;
  return cachedBlockList;
}

/**
 * Format block list for prompt.
 */
export function formatBlockList(blocks) {
  return blocks
    .filter(b => !b.internal)
    .map(b => `- <${b.name}>: ${b.description || '(no description)'}`)
    .join('\n');
}

/**
 * Build the system prompt for the editor LLM.
 */
export async function buildSystemPrompt({ path, content }) {
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
- applyEdit: Make changes to the current file (applied immediately)
- getBlockInfo: Get detailed docs for a specific block
- readFile: Read another file from the content library
`;
}
