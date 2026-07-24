// packages/shared/lib/grammarDirs.ts
//
// Shared configuration for PEG grammar directories.
// Used by compile-grammars.ts, generate-parser-registry.ts, and docs API.
// DRY: Single source of truth for where to find grammars.
//
// NOTE: If you add a directory here, also add it to getAllowedReadDirs()
// in packages/shared/lib/storage/lofs/providers/file.ts for the docs API to access it.
//
export const GRAMMAR_DIRS = [
  'packages/shared/components/blocks',
  'packages/shared/lib/template',
  'packages/shared/lib/stateLanguage',
  'packages/shared/lib/util/calc',
];
