// src/lib/lofs/searchUtils.ts
//
// Shared search helpers for LOFS providers.
//
import type { GrepMatch } from '../types/storage';

/**
 * Search file contents for lines matching a regex pattern.
 *
 * Takes an iterable of {path, content} pairs and returns matching lines.
 * Used by memory, git, postgres, and file providers to deduplicate
 * the core grep logic.
 *
 * @param files - Iterable of file path + content pairs
 * @param pattern - Regex pattern string to match
 * @param limit - Maximum number of matches to return
 * @returns Array of matches with path, line number, and trimmed content
 */
export function grepContent(
  files: Iterable<{ path: string; content: string }>,
  pattern: string,
  limit: number = 1000,
): GrepMatch[] {
  const regex = new RegExp(pattern);
  const matches: GrepMatch[] = [];

  for (const file of files) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push({
          path: file.path as GrepMatch['path'],
          line: i + 1,
          content: lines[i].trim(),
        });
        if (matches.length >= limit) return matches;
      }
    }
  }

  return matches;
}
