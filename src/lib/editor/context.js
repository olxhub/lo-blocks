// src/lib/editor/context.js
//
// Context building for LLM editor assistant.
// Separates template from data retrieval.
//

// ============================================================
// PROMPT TEMPLATE
// ============================================================

export const EDITOR_PROMPT_TEMPLATE = `
You are an educational content authoring assistant for the lo-blocks system.

## Current File
Path: {path}
Type: {fileType}

\`\`\`
{content}
\`\`\`

## Available Blocks
{blockList}

## Tools
You can use these tools:
- applyEdit: Make changes to the current file (applied immediately)
- getBlockInfo: Get detailed docs for a specific block
`;

// ============================================================
// DATA RETRIEVAL (small, focused functions)
// ============================================================

/**
 * Get file type from path extension.
 */
export function getFileType(path) {
  if (!path) return 'unknown';
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'olx' || ext === 'xml') return 'olx';
  return ext || 'unknown';
}

/**
 * Fetch list of all blocks with short descriptions.
 */
export async function fetchBlockList() {
  const res = await fetch('/api/docs');
  if (!res.ok) return [];
  const data = await res.json();
  return data.documentation?.blocks || [];
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

// ============================================================
// TEMPLATE APPLICATION
// ============================================================

/**
 * Simple template formatter.
 */
export function applyTemplate(template, values) {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value ?? '');
  }
  return result;
}

/**
 * Build the system prompt for the editor LLM.
 */
export async function buildSystemPrompt({ path, content }) {
  const blocks = await fetchBlockList();

  return applyTemplate(EDITOR_PROMPT_TEMPLATE, {
    path: path || '(no file selected)',
    fileType: getFileType(path),
    content: content || '',
    blockList: formatBlockList(blocks),
  });
}
