// packages/shared/lib/content/collectErrors.ts
//
// The single in-tree error query.
//
// Errors that live IN the content tree are represented uniformly as `ErrorNode`
// entries in an idMap (a downgraded parse error, a render error written by
// RenderOLX's boundary, a load error). `collectErrors` walks any idMap and
// returns those nodes as a flat, typed list keyed by node id.
//
// It is deliberately direction-agnostic: the same function serves
//   - parse/lint ("validate this content cold")  → pass a parseOLX result idMap
//   - a live session ("what's broken right now")  → pass a snapshot of the
//                                                    olxjson store
// so the app, the tests, and (later) an MCP can all read errors the same way.
//
// NOTE — the one thing it does NOT see: warning-only parse errors that do not
// downgrade their block (e.g. grader/input type mismatches). Those keep the
// block, so there is no ErrorNode in the tree; they live only in parseOLX's
// returned `errors[]`. `collectErrors` answers "what failed in the tree", not
// "every diagnostic parse produced". Callers that need the complete parse list
// read both. See docs/error-handling-design.md.
//
import type { IdMap } from '@/lib/types';
import type { AppError, OLXLoadingError, OLXSourceLocation } from '@/lib/types/errors';
import { variantMapKeys } from '@/lib/types/i18n';

/**
 * A flattened error read out of an ErrorNode in the tree.
 *
 * NOT a new error shape: it is the canonical {@link AppError} (carried by render
 * errors) plus the two fields {@link OLXLoadingError} adds (carried by parse
 * errors) — both reused from the canonical types, not redeclared — plus the
 * owning node `id`. `type`/`location` are optional because render errors don't
 * have them.
 */
export type CollectedError = AppError & {
  /** The id of the ErrorNode in the idMap (the node that failed). */
  id: string;
  /** OLXLoadingError discriminator, when the error came from the parser. */
  type?: OLXLoadingError['type'];
  /** Source location (provenance + line/column), when known. */
  location?: OLXSourceLocation;
};

/**
 * Walk an idMap and return every ErrorNode as a typed {@link CollectedError}.
 * One error per node id (variants of a failed node carry the same failure).
 */
export function collectErrors(idMap: IdMap | null | undefined): CollectedError[] {
  if (!idMap) return [];
  const out: CollectedError[] = [];
  for (const id of Object.keys(idMap)) {
    const variants = idMap[id];
    if (!variants) continue;
    for (const lang of variantMapKeys(variants)) {
      const entry: any = variants[lang];
      if (entry?.tag !== 'ErrorNode') continue;
      const attrs = (entry.attributes ?? {}) as Partial<CollectedError>;
      out.push({
        id,
        title: attrs.title,
        message: attrs.message ?? 'Unknown error',
        type: attrs.type,
        location: attrs.location,
        technical: attrs.technical,
        stack: attrs.stack,
      });
      break; // one error per node id
    }
  }
  return out;
}
