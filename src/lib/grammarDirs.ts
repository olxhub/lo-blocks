// src/lib/grammarDirs.ts
//
// Shared configuration for PEG grammar directories.
// Used by compile-grammars.ts, generate-parser-registry.ts, and docs API.
// DRY: Single source of truth for where to find grammars.
//
// NOTE: If you add a directory here, also add it to getAllowedReadDirs()
// in s../lib/lofs/providers/file.ts for the docs API to access it.
//
export const GRAMMAR_DIRS = [
  'src/components/blocks',
  'src/lib/template',
  'src/lib/stateLanguage',
];
