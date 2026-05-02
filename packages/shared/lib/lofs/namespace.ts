// src/lib/lofs/namespace.ts
//
// Content namespaces for cross-course references.
//
// A namespace identifies a course, repository, or logical content scope.
// Examples:
//   "local"                           — local development content
//   "docs"                            — block/grammar documentation
//   "github.com/pmitros/ee101"        — a specific course repo
//   "institution.edu/cs101"           — institutional deployment
//
// Cross-namespace references use the "ns:id" syntax in OLX:
//   <Use ref="github.com/pmitros/analogdesign:rc_circuit_intro" />
//
// The delimiter is ":" between namespace and ID. This is unambiguous because:
// - Namespace part contains "/" (not allowed in bare OlxKeys)
// - OlxKeys never contain "/"
// - Redux scope also uses ":" but only in target= / ReduxStateKeys, never in id= attrs
//
import type { OlxKey, OlxReference } from '../types';
import { refToOlxKey, toOlxKey } from '../types/id';
import type { ContentNamespace } from '../types/storage';
import { toContentNamespace } from '../types/storage';

/**
 * A qualified reference to a block in another namespace.
 * Format: "namespace:blockId" (e.g., "github.com/pmitros/ee101:hw1_problem3")
 * or just "blockId" for the current namespace.
 */
export type QualifiedOlxReference = string & { readonly __brand: 'QualifiedOlxReference' };

/**
 * Parse a qualified reference into namespace + key.
 *
 * Rules:
 * - "github.com/pmitros/ee101:hw1" → { namespace: "github.com/pmitros/ee101", key: "hw1" }
 * - "foo" → { key: "foo" } (no namespace — resolves in current context)
 * - "/foo" → { key: "foo" } (absolute ref within current namespace)
 *
 * The parser looks for ":" preceded by a "/" (which distinguishes namespaces
 * from Redux scope markers like "list:#0:child").
 */
export function parseQualifiedReference(
  ref: string
): { namespace?: ContentNamespace; key: OlxKey } {
  // Only split on ":" if the part before it contains "/" (namespace indicator).
  // This avoids misinterpreting Redux-style scoped keys.
  const colonIdx = ref.indexOf(':');
  if (colonIdx > 0) {
    const beforeColon = ref.slice(0, colonIdx);
    if (beforeColon.includes('/')) {
      // This is a namespace-qualified reference
      const ns = beforeColon;
      const id = ref.slice(colonIdx + 1);
      return {
        namespace: toContentNamespace(ns),
        key: toOlxKey(id),
      };
    }
  }

  // Bare or absolute reference — no namespace.
  // Use refToOlxKey which handles prefix stripping (/, ./)
  return { key: refToOlxKey(ref as OlxReference) };
}

/**
 * Check if a reference string contains a namespace qualifier.
 */
export function isQualifiedReference(ref: string): boolean {
  const colonIdx = ref.indexOf(':');
  if (colonIdx <= 0) return false;
  return ref.slice(0, colonIdx).includes('/');
}

/**
 * Build a qualified reference string from namespace + key.
 */
export function toQualifiedReference(
  ns: ContentNamespace,
  key: OlxKey
): QualifiedOlxReference {
  return `${ns}:${key}` as QualifiedOlxReference;
}
