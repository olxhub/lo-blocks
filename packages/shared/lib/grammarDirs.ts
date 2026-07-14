// packages/shared/lib/grammarDirs.ts
//
// Shared configuration for PEG grammar directories.
// Used by compile-grammars.ts, generate-parser-registry.ts, and docs API.
// DRY: Single source of truth for where to find grammars.
//
// The docs API reads these via resolveSafeReadPath(process.cwd(), dir), which
// confines to the project root — any path under cwd (including these) is
// readable, so no separate allow-list registration is needed.
//
export const GRAMMAR_DIRS = [
  'packages/shared/components/blocks',
  'packages/shared/lib/template',
  'packages/shared/lib/stateLanguage',
  'packages/shared/lib/util/calc',
];
