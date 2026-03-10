// src/lib/translate/metadata.ts
//
// Helpers for processing LLM translation output:
// code fence stripping, frontmatter extraction, and metadata assembly.

import yaml from 'js-yaml';

/** Strip markdown code fences that LLMs sometimes wrap around output. */
export function stripCodeFences(text: string): string {
  let result = text.trim();
  if (result.startsWith('```')) {
    const firstNewline = result.indexOf('\n');
    if (firstNewline !== -1) {
      result = result.slice(firstNewline + 1);
    }
    if (result.endsWith('```')) {
      result = result.slice(0, -3).trimEnd();
    }
  }
  return result;
}

/** Extract leading XML/HTML comments and the remaining body.
 *  Comments inside the document are preserved in the body. */
export function extractLeadingComments(content: string): { comments: string[]; body: string } {
  const comments: string[] = [];
  let s = content;
  while (true) {
    s = s.trimStart();
    if (!s.startsWith('<!--')) break;
    const endIdx = s.indexOf('-->');
    if (endIdx === -1) break;
    comments.push(s.slice(4, endIdx).trim());
    s = s.slice(endIdx + 3);
  }
  return { comments, body: s.trimStart() };
}

/** Try to parse YAML frontmatter from extracted comment texts. */
export function parseMetadataFromComments(comments: string[]): Record<string, any> {
  for (const text of comments) {
    const match = text.match(/^---\s*\n([\s\S]*?)\n\s*---\s*$/);
    if (!match) continue;
    try {
      return (yaml.load(match[1]) as Record<string, any>) || {};
    } catch {
      continue;
    }
  }
  return {};
}

/** Build a YAML frontmatter comment from a metadata object. */
export function buildFrontmatter(metadata: Record<string, any>): string {
  const body = yaml.dump(metadata, { lineWidth: -1 }).trimEnd();
  return `<!--\n---\n${body}\n---\n-->`;
}

/** Hash content for source_version tracking. */
export { hashContent } from '@/lib/util';
