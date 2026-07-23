// packages/shared/lib/content/linkContent.ts
//
// The "link" stage of the content pipeline:
//
//     parse (per file) → merge → (ID-finalize: reserved) → link → render
//
// Parsing runs per file and knows only that file. Merging combines the
// per-file idMaps into one snapshot. `linkContent` runs ONCE over that
// complete merged snapshot — the first stage that can see the whole content
// graph at once — and is where cross-block work will eventually live:
// resolving references, building relation edges, and validating over the
// full graph.
//
// Today it is a pure identity function: it returns the snapshot untouched
// and an empty diagnostics list. It exists now so every content-assembly
// path has a single, shared seam to route through; the behavior arrives
// later without having to re-find every call site.
//
// PURITY CONTRACT: linkContent never mutates authored content. It returns
// the same idMap reference it was given, so wiring it in is exactly
// behavior-preserving.

import type { IdMap } from '@/lib/types';

/**
 * A problem found while linking the merged content graph (an unresolved
 * reference, a dangling relation edge, a validation failure). Reserved: the
 * link stage produces none today, so the shape is intentionally empty and
 * will be filled in when linking does real work.
 */
export interface LinkDiagnostic {
  /* reserved; empty for now */
}

/** The output of the link stage: the linked snapshot plus any diagnostics. */
export interface LinkedContent {
  idMap: IdMap;
  diagnostics: LinkDiagnostic[];
}

/**
 * The link stage (parse → merge → [ID-finalize: reserved] → link → render).
 *
 * Identity today; will resolve references, build relation edges, and validate
 * over the complete merged graph. Pure: never mutates authored content, and
 * returns the same idMap reference it was handed.
 */
export function linkContent(idMap: IdMap): LinkedContent {
  return { idMap, diagnostics: [] };
}
