// src/lib/stateLanguage/references.ts
//
// HACK: redux-react plugins were a little complex when we were
// developing this, so we just do a regexp for {{ }} before rendering.
//
// We should extract references from AST by walking the tree.  No
// regex - proper AST traversal.


import { parse, tryParse } from './parser';
import type { ASTNode, SigilRef } from './parser';

/**
 * A single reference extracted from an expression.
 */
export interface Reference {
  sigil: '@' | '#' | '$';
  id: string;
  fields: string[];
}

/**
 * Structured references grouped by type.
 * This shape mirrors ContextData for easy mapping.
 */
export interface References {
  componentState: { key: string; fields: string[] }[];
  olxContent: { id: string }[];
  globalVar: { name: string }[];
}

/**
 * Empty references object.
 */
export const EMPTY_REFS: References = {
  componentState: [],
  olxContent: [],
  globalVar: []
};

/**
 * Walk an AST node and collect all SigilRef nodes.
 */
function collectSigilRefs(node: ASTNode, refs: SigilRef[]): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'SigilRef') {
    refs.push(node);
    return;
  }

  // Recursively walk based on node type
  switch (node.type) {
    case 'BinaryOp':
      collectSigilRefs(node.left, refs);
      collectSigilRefs(node.right, refs);
      break;
    case 'UnaryOp':
      collectSigilRefs(node.argument, refs);
      break;
    case 'Ternary':
      collectSigilRefs(node.condition, refs);
      collectSigilRefs(node.then, refs);
      collectSigilRefs(node.else, refs);
      break;
    case 'Call':
      collectSigilRefs(node.callee, refs);
      for (const arg of node.arguments) {
        collectSigilRefs(arg, refs);
      }
      break;
    case 'MemberAccess':
      collectSigilRefs(node.object, refs);
      break;
    case 'ArrowFunction':
      collectSigilRefs(node.body, refs);
      break;
    case 'TemplateLiteral':
      for (const part of node.parts) {
        if (part.type === 'TemplateExpr') {
          collectSigilRefs(part.expression, refs);
        }
      }
      break;
    // Terminals - no children
    case 'Number':
    case 'String':
    case 'Identifier':
      break;
  }
}

/**
 * Extract all sigil references from an expression string.
 * Returns unique references (deduplicated by sigil+id+fields).
 *
 * @param expression - Expression string to parse
 * @returns Array of unique references
 */
export function extractReferences(expression: string): Reference[] {
  if (!expression || expression.trim() === '') {
    return [];
  }

  const ast = tryParse(expression);
  if (!ast) {
    return [];
  }

  const sigilRefs: SigilRef[] = [];
  collectSigilRefs(ast, sigilRefs);

  // Deduplicate by key
  const seen = new Set<string>();
  const unique: Reference[] = [];

  for (const ref of sigilRefs) {
    const key = `${ref.sigil}:${ref.id}:${ref.fields.join('.')}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({
        sigil: ref.sigil,
        id: ref.id,
        fields: ref.fields,
      });
    }
  }

  return unique;
}

/**
 * Extract component IDs (@sigil) from an expression.
 */
export function extractComponentIds(expression: string): string[] {
  return extractReferences(expression)
    .filter(ref => ref.sigil === '@')
    .map(ref => ref.id);
}

/**
 * Extract content IDs (#sigil) from an expression.
 */
export function extractContentIds(expression: string): string[] {
  return extractReferences(expression)
    .filter(ref => ref.sigil === '#')
    .map(ref => ref.id);
}

/**
 * Extract global variable names ($sigil) from an expression.
 */
export function extractGlobalVars(expression: string): string[] {
  return extractReferences(expression)
    .filter(ref => ref.sigil === '$')
    .map(ref => ref.id);
}

/**
 * Convert flat Reference[] to structured References.
 */
export function toStructuredRefs(refs: Reference[]): References {
  const result: References = {
    componentState: [],
    olxContent: [],
    globalVar: []
  };

  for (const ref of refs) {
    switch (ref.sigil) {
      case '@':
        result.componentState.push({ key: ref.id, fields: ref.fields });
        break;
      case '#':
        result.olxContent.push({ id: ref.id });
        break;
      case '$':
        result.globalVar.push({ name: ref.id });
        break;
    }
  }

  return result;
}

/**
 * Extract structured references from an expression.
 */
export function extractStructuredRefs(expression: string): References {
  return toStructuredRefs(extractReferences(expression));
}

/**
 * Merge multiple References objects, deduplicating entries.
 */
export function mergeReferences(...refsList: References[]): References {
  const componentStateMap = new Map<string, Set<string>>();
  const olxContentSet = new Set<string>();
  const globalVarSet = new Set<string>();

  for (const refs of refsList) {
    for (const { key, fields } of refs.componentState) {
      if (!componentStateMap.has(key)) {
        componentStateMap.set(key, new Set());
      }
      const fieldSet = componentStateMap.get(key)!;
      for (const field of fields) {
        fieldSet.add(field);
      }
      // Also track "no fields" case
      if (fields.length === 0) {
        fieldSet.add('');
      }
    }
    for (const { id } of refs.olxContent) {
      olxContentSet.add(id);
    }
    for (const { name } of refs.globalVar) {
      globalVarSet.add(name);
    }
  }

  // Convert back to structured format
  const componentState: References['componentState'] = [];
  for (const [key, fieldSet] of componentStateMap) {
    // Remove empty string marker
    fieldSet.delete('');
    componentState.push({ key, fields: Array.from(fieldSet) });
  }

  return {
    componentState,
    olxContent: Array.from(olxContentSet).map(id => ({ id })),
    globalVar: Array.from(globalVarSet).map(name => ({ name }))
  };
}

/**
 * Extract and merge references from multiple expressions.
 */
export function extractAndMergeRefs(...expressions: string[]): References {
  return mergeReferences(...expressions.map(extractStructuredRefs));
}

// ============================================
// Text Interpolation Utilities
// ============================================

/**
 * An interpolation found in text.
 */
export interface Interpolation {
  expression: string;  // The expression inside {{...}}
  start: number;       // Start position in original text
  end: number;         // End position in original text
}

/**
 * Extract all {{...}} interpolations from text.
 *
 * @param text - The text to search for interpolations
 * @returns Array of interpolations found
 */
export function extractInterpolations(text: string): Interpolation[] {
  const interpolations: Interpolation[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    interpolations.push({
      expression: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return interpolations;
}

/**
 * Extract all references from interpolations in text.
 *
 * @param text - The text containing {{...}} interpolations
 * @returns Merged references from all interpolations
 */
export function extractInterpolationRefs(text: string): References {
  const interpolations = extractInterpolations(text);
  if (interpolations.length === 0) return EMPTY_REFS;

  return mergeReferences(
    ...interpolations.map(i => extractStructuredRefs(i.expression))
  );
}
