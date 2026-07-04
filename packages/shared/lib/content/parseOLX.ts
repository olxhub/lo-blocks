// packages/shared/lib/content/parseOLX.ts
//
// OLX document parser - main entry point for processing Learning Observer XML content.
//
// Transforms complete OLX documents into the internal idMap representation that
// the rest of Learning Observer uses for rendering and interaction. The parser:
//
// - Uses fast-xml-parser to handle XML parsing with attribute preservation
// - Routes each XML tag to appropriate block-specific parsers
// - Builds a flat idMap of all blocks for efficient lookups
// - Handles <Use ref="..."> references for content reuse (DAG structure)
// - Generates IDs for blocks that don't have explicit ones
// - Collects and reports parsing errors with detailed provenance
//
// The result is a normalized representation where all content is addressable
// by ID, relationships are explicit, and the structure supports DAG reuse patterns.
//
import SHA1 from 'crypto-js/sha1';
import yaml from 'js-yaml';

import { XMLValidator } from 'fast-xml-parser';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { xmlParser, isElementNode, XML_META } from './xmlParser';

import * as parsers from '@/lib/content/parsers';
import { LofsDependencies, IdMap, OlxJson, OLXLoadingError, DefinitionRef, DefinitionKey, JSONValue, ContentNamespace } from '@/lib/types';
import { qualifyDefinitionRef, parseDefinitionRef, asDefinitionRef, makeSystemDefinitionRef, stateKeyForGlobalRef, parseAnyDefinitionRef, parseAnyStateRef, allDefinitionKeysFromStateKey } from '@/lib/types/id-grammar';
import type { LofsRef, LofsCanonical } from '@/lib/types/address';
import { toLofsCanonical, withVersion, toLofsVersion } from '@/lib/types/address';
import { variantMapKeys } from '@/lib/types/i18n';
import { hashContent } from '@/lib/util';

import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { isZodCompatible, describeZodType } from '@/lib/blocks/zodCompat';
import { OLXMetadataSchema, type OLXMetadata } from '@/lib/content/metadata';
import { stableStringify } from '@/lib/util';
import { toAppError } from '@/lib/types/errors';

const defaultParser = parsers.blocks().parser;

// The XMLParser instance and fragment helpers live in xmlParser.ts
// (registry-free) so blueprints can use parseXmlFragment without importing
// this module, which imports BLOCK_REGISTRY. Re-exported for existing
// render-side callers.
export { parseXmlFragment } from './xmlParser';

function isBlockKid(node: JSONValue): node is { type: 'block'; id: DefinitionKey } {
  return typeof node === 'object' && node !== null && !Array.isArray(node) &&
    node.type === 'block' && typeof node.id === 'string';
}

/**
 * Convert a byte offset within an XML source string to a 1-based line/column
 * pair. Returns the bits in the shape OLXLoadingError.location accepts, so callers
 * can spread directly:
 *
 *   location: { provenance: [source, ...parseDeps], ...offsetToLineCol(xml, sourceOffset) }
 *
 * If `offset` is undefined (e.g. a synthetic node that never had a
 * captureMetaData symbol attached) the result is empty and nothing extra
 * gets spread into location.
 */
function offsetToLineCol(
  src: string,
  offset: number | undefined
): { line?: number; column?: number; offset?: number } {
  if (offset === undefined || offset < 0) return {};
  let line = 1;
  let lastNl = -1;
  const stop = Math.min(offset, src.length);
  for (let i = 0; i < stop; i++) {
    if (src.charCodeAt(i) === 10 /* \n */) {
      line++;
      lastNl = i;
    }
  }
  return { line, column: offset - lastNl, offset };
}

/**
 * Check if a block type requires unique IDs based on its Component definition.
 * Returns true (require unique) or false (duplicates OK).
 *
 * The factory validates requiresUniqueId at block registration time, so by the
 * time this runs, the value is guaranteed to be boolean or undefined.
 *
 * TODO: Future modes like 'children' (inherit from child blocks) or function
 * (dynamic per-instance check) could be added in the factory and here.
 */
export function blockRequiresUniqueId(Component): boolean {
  if (!Component) return true;
  return Component.requiresUniqueId ?? true;
}

/**
 * Check whether two OlxJson entries with the same ID and language are
 * an acceptable duplicate (stateless block with identical content) or
 * a real conflict. Used by both within-file and cross-file duplicate
 * detection.
 */
export function isAcceptableDuplicate(existing: OlxJson, incoming: OlxJson): boolean {
  const Component = BLOCK_REGISTRY[incoming.tag];
  if (blockRequiresUniqueId(Component)) return false;
  return (
    (existing.tag || '') === (incoming.tag || '') &&
    stableStringify(existing.kids) === stableStringify(incoming.kids) &&
    stableStringify(existing.attributes) === stableStringify(incoming.attributes)
  );
}

// TODO: Future requiresUniqueId modes to consider:
// - 'children': inherit uniqueness requirement from child blocks (e.g. Markdown
//   with embedded interactive widgets would need unique IDs, plain Markdown wouldn't)
// - function: dynamic per-instance check based on content/attributes

/**
 * Resolves the language for an element using the cascade:
 * 1. OLX attribute on element (`lang="..."`)
 * 2. Element's own metadata language (from YAML comment above it)
 * 3. Parent element's resolved language (carries file-level lang via cascade)
 * 4. Default '*' (language-agnostic)
 *
 * TODO: Should we swap #1 and #2? Logically, the current order makes sense,
 * but swapping would be more flexible (lang= also sets user locale; metadata
 * does not).
 *
 * File-level language doesn't need a separate parameter - the root element's
 * metadata lang becomes its resolved lang, which cascades to children via parentLang.
 *
 * @param elementAttributes - The parsed attributes of the current element
 * @param parentLang - Language inherited from parent element
 * @param metadataLang - Language from this element's own metadata comment
 * @returns The resolved BCP 47 language tag
 */
function resolveElementLanguage(
  elementAttributes: Record<string, JSONValue>,
  parentLang: string | undefined,
  metadataLang: string | undefined
): string {
  // 1. Check element's own lang attribute
  if (elementAttributes?.lang && typeof elementAttributes.lang === 'string') {
    return elementAttributes.lang;
  }

  // 2. Check element's own metadata (from YAML comment above this element)
  if (metadataLang) {
    return metadataLang;
  }

  // 3. Inherit from parent (carries file-level lang via cascade)
  if (parentLang) {
    return parentLang;
  }

  // 4. Default - generic/language-agnostic content (shown to everyone)
  return '*';
}

/**
 * Extracts metadata from a comment node's text content.
 *
 * Looks for YAML frontmatter in the format:
 *   <!--
 *   ---
 *   key: value
 *   ---
 *   -->
 *
 * @param commentText - The text content of an XML comment
 * @param source - The OLX file this block was parsed from
 * @param parseDeps - Auxiliary files loaded during parsing
 * @param errors - Array to collect parsing errors
 * @returns Three possible outcomes:
 *   - null: No YAML frontmatter found (comment doesn't have --- delimiters)
 *   - OLXLoadingError: Metadata frontmatter found but has syntax/validation errors
 *   - OLXMetadata: Valid metadata successfully parsed and validated
 */
function extractMetadataFromComment(
  commentText: any,
  source: LofsCanonical,
  parseDeps: LofsCanonical[],
  errors: OLXLoadingError[]
): OLXMetadata | OLXLoadingError | null {
  const provenance: LofsDependencies = [source, ...parseDeps];
  const provStr = provenance.join(' → ');

  // Fail early if comment structure is invalid
  //
  // This is likely obsolete / overly-defensive, and the next two if
  // statements should be removed if these issues are never triggered.

  if (commentText === undefined || commentText === null) {
    const error: OLXLoadingError = {
      type: 'parse_error',
      title: `Internal parser error in ${provStr}`,
      message: 'Internal parser error: Comment node found but text content is missing. This may indicate a parser configuration issue.',
      location: { provenance },
      technical: { commentText }
    };
    errors.push(error);
    return error;
  }

  if (typeof commentText !== 'string') {
    const error: OLXLoadingError = {
      type: 'parse_error',
      title: `Internal parser error in ${provStr}`,
      message: `Internal parser error: Comment text has unexpected type '${typeof commentText}' (expected string).`,
      location: { provenance },
      technical: { commentText, type: typeof commentText }
    };
    errors.push(error);
    return error;
  }

  // Trim whitespace and check for YAML frontmatter delimiters (---)
  // Must start with --- and end with --- to be treated as metadata
  const trimmed = commentText.trim();
  // Allow optional whitespace before closing --- to handle indented comments in tests
  const frontmatterMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n\s*---\s*$/);
  if (!frontmatterMatch) {
    return null; // No YAML frontmatter - not metadata, just a regular comment
  }

  const yamlContent = frontmatterMatch[1];

  try {
    // Parse YAML
    const parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });

    // Validate with Zod schema
    const result = OLXMetadataSchema.safeParse(parsed);

    if (!result.success) {
      // Create teacher-friendly error message
      const issues = result.error.issues.map(issue =>
        `  • ${issue.path.join('.')}: ${issue.message}`
      ).join('\n');

      const error: OLXLoadingError = {
        type: 'metadata_error',
        title: `${provStr} has an error in its file header`,
        message: `📝 Metadata Format Error

The metadata in your comment has formatting issues:

${issues}

📍 FOUND IN:
   ${trimmed.split('\n').slice(0, 5).join('\n   ')}${trimmed.split('\n').length > 5 ? '\n   ...' : ''}

💡 TIP: Check that your metadata follows the correct format. For example:
   <!--
   ---
   description: A brief description of your activity
   category: psychology
   ---
   -->

Common issues:
• Make sure field names are spelled correctly
• Text values should be in quotes if they contain special characters
• Lists need proper YAML formatting with dashes (-)`,
        location: { provenance },
        technical: {
          yamlContent,
          zodIssues: result.error.issues
        }
      };
      errors.push(error);
      return error;
    }

    return result.data;
  } catch (yamlError: any) {
    // YAML parsing failed
    const error: OLXLoadingError = {
      type: 'metadata_error',
      title: `${provStr} has an error in its file header`,
      message: `📝 Metadata YAML Syntax Error

The metadata in your comment contains invalid YAML syntax:

${yamlError.message}

📍 FOUND IN:
   ${trimmed.split('\n').slice(0, 5).join('\n   ')}${trimmed.split('\n').length > 5 ? '\n   ...' : ''}

💡 TIP: Common YAML syntax issues:
• Missing spaces after colons (use "key: value" not "key:value")
• Incorrect indentation (use 2 spaces per level)
• Unmatched quotes or brackets
• Tabs instead of spaces (YAML requires spaces)

Example of correct format:
   <!--
   ---
   description: Master operant conditioning concepts
   category: psychology
   ---
   -->`,
      location: { provenance },
      technical: {
        yamlContent,
        yamlError: yamlError.message,
        yamlErrorDetails: yamlError
      }
    };
    errors.push(error);
    return error;
  }
}

/**
 * Extracts metadata from a preceding sibling comment.
 *
 * Searches backwards from the current node index to find the nearest
 * preceding comment with valid YAML metadata frontmatter, skipping whitespace.
 * Stops searching when a metadata comment is found, or when encountering
 * non-comment, non-whitespace content.
 *
 * @param siblings - Array of sibling nodes
 * @param nodeIndex - Index of the current node in the siblings array
 * @param source - The OLX file this block was parsed from
 * @param parseDeps - Auxiliary files loaded during parsing
 * @param errors - Array to collect parsing errors (errors are added by extractMetadataFromComment)
 * @returns Metadata object with defaults applied, empty if no valid metadata found
 */
function extractSiblingMetadata(
  siblings: any[] | null,
  nodeIndex: number,
  source: LofsCanonical,
  parseDeps: LofsCanonical[],
  errors: OLXLoadingError[]
): OLXMetadata {
  if (!siblings || nodeIndex <= 0) {
    return OLXMetadataSchema.parse({});
  }

  // Look backwards for a comment with valid metadata
  for (let i = nodeIndex - 1; i >= 0; i--) {
    const sibling = siblings[i];

    // Skip whitespace text nodes
    if ('#text' in sibling) {
      const text = sibling['#text'];
      if (text && typeof text === 'string' && text.trim() === '') {
        continue; // Skip whitespace
      }
      break; // Stop at non-whitespace text
    }

    // Found a comment - try to extract metadata
    if ('#comment' in sibling) {
      // With fast-xml-parser preserveOrder:true, comments have structure:
      // { '#comment': [{ '#text': 'content' }] }
      // Using direct property access (not ?.) to fail fast if structure is unexpected
      const commentText = sibling['#comment'][0]['#text'];
      const result = extractMetadataFromComment(commentText, source, parseDeps, errors);

      if (result === null) {
        // No YAML frontmatter - keep searching backwards for a metadata comment
        continue;
      }

      if ('type' in result) {
        // Error found in metadata (parse_error or metadata_error) -
        // return defaults. Error already added to errors array by extractMetadataFromComment.
        return OLXMetadataSchema.parse({});
      }

      // Valid metadata found (result is now narrowed to OLXMetadata)
      return result as OLXMetadata;
    }

    // Stop at any other element (not comment, not whitespace)
    break;
  }

  return OLXMetadataSchema.parse({});
}

export async function parseOLX(
  xml,
  inputProvenance: LofsRef[],
  provider: import('../lofs').StorageProvider | undefined,
  ns: ContentNamespace
) {
  const idMap: IdMap = {};

  if (inputProvenance.length !== 1) {
    throw new Error(
      `parseOLX expects exactly one input provenance ref, got ${inputProvenance.length}. ` +
      `Multi-ref canonicalization is not implemented.`
    );
  }
  const contentVersion = toLofsVersion(await hashContent(xml));
  const source: LofsCanonical = toLofsCanonical(withVersion(inputProvenance[0], contentVersion));
  const parseDeps: LofsCanonical[] = [];

  // Validate XML first for better error messages
  const provenanceStr = String(source);
  const validation = XMLValidator.validate(xml, {
    allowBooleanAttributes: true
  });

  if (validation !== true) {
    // validation is an error object with err.code, err.msg, err.line, err.col
    const err = validation.err;
    const lines = xml.split('\n');

    // Show context around the error line
    const errorLine = err.line || 1;
    const startLine = Math.max(0, errorLine - 3);
    const endLine = Math.min(lines.length, errorLine + 2);
    const context = lines.slice(startLine, endLine)
      .map((line, i) => {
        const lineNum = startLine + i + 1;
        const marker = lineNum === errorLine ? '>>>' : '   ';
        return `${marker} ${lineNum}: ${line}`;
      })
      .join('\n');

    throw new Error(
      `XML syntax error in ${provenanceStr} at line ${err.line}, column ${err.col}:\n` +
      `${err.msg}\n\n` +
      `Context:\n${context}\n\n` +
      `Check for: unclosed quotes, missing closing tags, or invalid characters.`
    );
  }

  let parsedTree;
  try {
    parsedTree = xmlParser.parse(xml);
  } catch (parseError) {
    // Fallback error handling if validation passed but parsing still failed
    const lines = xml.split('\n');
    const preview = lines.slice(0, 10).map((line, i) => `${i + 1}: ${line}`).join('\n');

    throw new Error(
      `XML parsing error in ${provenanceStr}:\n` +
      `${parseError.message}\n\n` +
      `First 10 lines of content:\n${preview}\n\n` +
      `Check for: unclosed tags, invalid characters, or malformed XML syntax.`
    );
  }

  const parsedIds: DefinitionKey[] = [];
  let rootId = '';
  const errors: OLXLoadingError[] = [];

  // Track attribute objects whose `id` was set by the system (component parsers),
  // not authored in OLX. This lets parseNode distinguish system-assigned IDs
  // (which may start with "_") from authored IDs (which must not).
  // HACK: This is a workaround for CapaProblem mutating child node attributes
  // and then re-walking them through parseNode. A proper fix would restructure
  // the parser pipeline so system-assigned children don't re-enter walkNode.
  const systemAssignedIds = new WeakSet<object>();

  /** Mark a node's id attribute as system-assigned. Component parsers call this
   *  instead of directly setting `node[':@'].id`. */
  function assignSystemId(node: any, id: DefinitionRef) {
    if (!node[':@']) node[':@'] = {};
    node[':@'].id = id;
    systemAssignedIds.add(node[':@']);
  }

  async function parseNode(node, siblings: any[] | null = null, nodeIndex = -1, parentLang: string | undefined = undefined, parentGenerated: OLXMetadata['generated'] | undefined = undefined) {
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;

    const attributes = node[':@'] ?? {};

    // Per-node source position from fast-xml-parser's captureMetaData. The
    // value is the byte offset of the opening `<` of this element within
    // the original XML string. May be undefined for synthetically-built
    // nodes (e.g. blocks.wrapText creates fake `{ Markdown: [...] }`
    // envelopes that never went through the XML parser). See
    // OlxJson._sourceOffset for the interim-storage rationale.
    const sourceOffset: number | undefined = node?.[XML_META]?.startIndex;

    // Extract metadata from preceding sibling comment
    const metadata = extractSiblingMetadata(siblings, nodeIndex, source, parseDeps, errors);

    // Resolve language for this element using cascade:
    // 1. Element's own lang attribute
    // 2. Element's own metadata language (from YAML comment above)
    // 3. Inherited from parent element (carries file-level lang via cascade)
    // 4. Default '*'
    const metadataLang = metadata?.lang;
    let currentLang = resolveElementLanguage(attributes, parentLang, metadataLang);

    // Resolve generated status: element's own metadata, or inherited from parent.
    // File-level generated (e.g., machineTranslated) cascades to all children.
    const currentGenerated = metadata?.generated || parentGenerated;

    if (tag === 'Use') {
      if (!attributes.ref) {
        throw new Error(
          `<Use> in ${source} requires a ref attribute, e.g. <Use ref="block_id"/>. ` +
          (attributes.id ? `Found id="${attributes.id}" — did you mean ref="${attributes.id}"?` : 'No ref attribute found.')
        );
      }

      const childKeys = Object.keys(node).filter(
        k => !['Use', ':@', '#text', '#comment'].includes(k)
      );
      if (childKeys.length > 0) {
        throw new Error(
          `<Use ref="..."> in ${source} must not have kid elements. Found kids: ${childKeys.join(', ')}`
        );
      }

      const { ref, ...overrides } = attributes;
      const qualifiedRef = qualifyDefinitionRef(parseDefinitionRef(ref), ns);
      return { type: 'block', id: qualifiedRef, overrides };
    }

    if (attributes.ref) {
      throw new Error(
        `Invalid 'ref' attribute on <${tag}> in ${source}. Only <Use> elements may have 'ref'.`
      );
    }

    // Validate IDs at the authoring boundary.
    // parseDefinitionRef rejects bare "_"-prefixed IDs (reserved for system use).
    // System-assigned IDs (from component parsers like CapaProblem that mutate
    // child attributes and re-walk) are tracked via systemAssignedIds WeakSet
    // and validated with parseAnyDefinitionRef (structural check, allows "_" prefix).
    const idStr = attributes.id ? String(attributes.id) : null;
    const systemAssigned = idStr && systemAssignedIds.has(attributes);
    let bareRef: DefinitionRef;
    try {
      bareRef = idStr
        ? (systemAssigned ? parseAnyDefinitionRef(idStr) : parseDefinitionRef(idStr))
        : createId(node);
    } catch (idError: any) {
      // Invalid authored ID — produce a recoverable ErrorNode instead of aborting the file.
      bareRef = createId(node);
      const id: DefinitionKey = qualifyDefinitionRef(bareRef, ns);
      const errorObj = {
        type: 'attribute_validation' as const,
        title: `Invalid id on <${tag}> in ${source}`,
        message: `Invalid id="${idStr}" on <${tag}>: ${idError.message}`,
        location: { provenance: [source, ...parseDeps], ...offsetToLineCol(xml, sourceOffset) },
        technical: { tag, id: idStr, attributes }
      };
      errors.push(errorObj);
      const lang = resolveElementLanguage(attributes, currentLang, metadataLang);
      const entry = {
        id, tag: 'ErrorNode', attributes: errorObj, source, parseDeps,
        rawParsed: node, kids: [], parseError: true,
        lang,
        ...(sourceOffset !== undefined ? { _sourceOffset: sourceOffset } : {}),
        ...(metadata || {})
      };
      if (!idMap[id]) idMap[id] = {};
      idMap[id][lang] = entry;
      parsedIds.push(id);
      return { type: 'block', id };
    }
    const id: DefinitionKey = qualifyDefinitionRef(bareRef, ns);

    const Component = BLOCK_REGISTRY[tag];

    // Validate and transform attributes - use component schema if defined, else base with passthrough
    // Passthrough preserves unknown attrs; strict() rejects unknown (catching typos like scr= vs src=)
    const schema = Component?.attributes ?? baseAttributes.passthrough();
    const result = schema.safeParse(attributes);
    let parsedAttributes = attributes;
    if (!result.success) {
      const zodErrors = result.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
      const errorObj = {
        type: 'attribute_validation' as const,
        title: `Invalid attribute on <${tag}> in ${source}`,
        message: `Invalid attributes for <${tag} id="${id}">:\n${zodErrors}`,
        location: { provenance: [source, ...parseDeps], ...offsetToLineCol(xml, sourceOffset) },
        technical: {
          tag,
          id,
          attributes,
          zodError: result.error
        }
      };
      errors.push(errorObj);

      // Replace block with ErrorNode instead of rendering with raw attributes.
      // Raw attributes bypass Zod transforms (e.g. sanitization, type coercion),
      // which could cause runtime crashes or security issues downstream.
      // Matches the PEG error pattern in parsers.ts.
      const lang = resolveElementLanguage(attributes, currentLang, metadataLang);
      const entry = {
        id, tag: 'ErrorNode', attributes: errorObj, source, parseDeps,
        rawParsed: node, kids: [], parseError: true,
        lang,
        ...(sourceOffset !== undefined ? { _sourceOffset: sourceOffset } : {}),
        ...(metadata || {})
      };
      if (!idMap[id]) idMap[id] = {};
      idMap[id][lang] = entry;
      parsedIds.push(id);
      return { type: 'block', id };
    } else {
      // Use transformed attributes (e.g., "true" -> true for booleans)
      parsedAttributes = result.data;

      // Re-resolve lang from transformed attributes (Zod canonicalizes e.g. "EN-us" → "en-US")
      if (parsedAttributes.lang) {
        currentLang = resolveElementLanguage(parsedAttributes, parentLang, metadataLang);
      }

      // Semantic validation beyond what Zod schema can express
      // e.g., NumericalGrader answer must be a valid number, StringGrader regexp must be valid
      if (Component?.validateAttributes) {
        const semanticErrors = Component.validateAttributes(parsedAttributes);
        if (semanticErrors && semanticErrors.length > 0) {
          const errorList = semanticErrors.map(e => `  - ${e}`).join('\n');
          errors.push({
            type: 'attribute_validation',
            title: `Invalid attribute on <${tag}> in ${source}`,
            message: `Invalid attributes for <${tag} id="${id}">:\n${errorList}`,
            location: { provenance: [source, ...parseDeps], ...offsetToLineCol(xml, sourceOffset) },
            technical: {
              tag,
              id,
              attributes: parsedAttributes,
              semanticErrors
            }
          });
        }
      }
    }

    const parser = Component?.parser || defaultParser;

    // Create a wrapper around parseNode that passes currentLang and currentGenerated
    // to child elements. This ensures language and provenance inheritance works correctly.
    const parseNodeWithLang = (childNode, childSiblings, childIndex) =>
      parseNode(childNode, childSiblings, childIndex, currentLang, currentGenerated);

    // Parse the node using the component's parser. The parser is responsible
    // for calling `storeEntry` for every piece of data that should be tracked
    // in the ID map. A single node may generate multiple entries this way.
    // The return value of `parseNode` simply exposes the block's primary id
    // and is only used when determining the document's root.
    //
    // A parser that THROWS is downgraded to a recoverable ErrorNode for this
    // block (below), mirroring the invalid-id / bad-attribute downgrades — so
    // one bad block can't abort parsing the whole file.
    try {
    await parser({
      id,
      rawParsed: node,
      tag,
      attributes: parsedAttributes,
      source,
      parseDeps,
      provider,
      ns,
      parseNode: parseNodeWithLang,
      assignSystemId,
      // Block lookup for parsers that inspect child block types (e.g.
      // CapaProblem's ID-assignment walk). A resolver function, not the
      // registry map: parsers must not import the registry themselves (a
      // blueprint → registry → blueprint cycle), and a future runtime
      // registry can swap this implementation without touching parsers.
      getBlock: (blockTag: string) => BLOCK_REGISTRY[blockTag],
      metadata,  // Pass metadata to parser so it can include in entry
      storeEntry: (refId: DefinitionRef, entryOrUpdater) => {
        // Callers pass branded DefinitionRef values — either the block's own
        // id (a DefinitionKey, which is a DefinitionRef subtype) or a child
        // ref built with joinDefinitionRef.  Bare refs get namespace-qualified
        // here; already-qualified keys pass through unchanged.
        const storeId = qualifyDefinitionRef(refId, ns);

        // Support both direct entry and updater function patterns:
        // - storeEntry(id, entry) - store/overwrite
        // - storeEntry(id, (existing) => newEntry) - update existing
        // Resolve language: if the entry has its own lang attribute, use it;
        // otherwise inherit from the current element's resolved language (currentLang).
        // We pass currentLang (not parentLang) because parser-generated entries
        // are conceptually children of this element, not siblings.
        let entryAttributes = parsedAttributes;
        if (typeof entryOrUpdater === 'object' && entryOrUpdater !== null && entryOrUpdater.attributes) {
          entryAttributes = entryOrUpdater.attributes;
        }
        const lang = resolveElementLanguage(entryAttributes, currentLang, metadataLang);
        const entry = typeof entryOrUpdater === 'function'
          ? entryOrUpdater(idMap[storeId]?.[lang])
          : entryOrUpdater;

        // Ensure entry.id matches the qualified store key so downstream code
        // (render, inferRelatedNodes, etc.) always sees qualified IDs.
        // Parsers set entry.id from their own id (DefinitionKey) or from
        // joinDefinitionRef (DefinitionRef) — both are valid DefinitionRef.
        if (entry && typeof entry === 'object' && 'id' in entry && typeof entry.id === 'string') {
          entry.id = qualifyDefinitionRef(asDefinitionRef(entry.id), ns);
        }

        // Ensure every entry has its resolved lang — it's used as the variant
        // map key AND needed on the entry for translation mismatch detection.
        if (entry && typeof entry === 'object' && !('lang' in entry)) {
          entry.lang = lang;
        }

        // Propagate generated status so extractLocalizedVariant can prefer
        // human-authored content over machine translations in its fallback.
        if (entry && typeof entry === 'object' && !('generated' in entry) && currentGenerated) {
          entry.generated = currentGenerated;
        }

        // Stamp provenance (source file + parse dependencies) so every entry
        // in the blockIndex is traceable. Block parsers that create child
        // entries (e.g. MarkupProblem → Markdown, GraderInline) typically
        // omit these — they're the same file, so we inherit from the parent.
        if (entry && typeof entry === 'object') {
          if (!('source' in entry)) entry.source = source;
          if (!('parseDeps' in entry)) entry.parseDeps = parseDeps;
        }

        // Stamp the byte offset of the source element. Parsers usually
        // build their entry from the same node parseNode is processing, so
        // we attach this here once instead of asking every parser to
        // remember it. Parsers that store an entry for a *different* node
        // (e.g. a synthetic child) can override by setting `_sourceOffset`
        // themselves before calling storeEntry. See OlxJson._sourceOffset
        // for the rationale on why this lives at the entry level rather
        // than inside provenance.
        if (
          entry && typeof entry === 'object'
          && !('_sourceOffset' in entry)
          && sourceOffset !== undefined
        ) {
          entry._sourceOffset = sourceOffset;
        }

        // If this is an update to an existing entry, just update it
        if (typeof entryOrUpdater === 'function' && idMap[storeId]?.[lang]) {
          if (!idMap[storeId]) idMap[storeId] = {};
          idMap[storeId][lang] = entry;
          return;
        }

        if (idMap[storeId]?.[lang]) {
          const existing = idMap[storeId][lang];
          if (isAcceptableDuplicate(existing, entry)) {
            // Identical stateless block (e.g. same Markdown in multiple tabs).
            // TODO: Lint suggestion to use <Use ref="..."/> instead.
            return;
          }

          // Get detailed information about both the existing and duplicate entries
          const existingEntry = idMap[storeId][lang];
          const existingLoc = offsetToLineCol(xml, existingEntry._sourceOffset);
          const dupLoc = offsetToLineCol(xml, entry._sourceOffset);

          errors.push({
            type: 'duplicate_id',
            title: `Duplicate ID "${storeId}" in ${source}`,
            message: `Duplicate ID "${storeId}" found in ${source}. Each element must have a unique id.

🔍 EXISTING ENTRY (Line ${existingLoc.line ?? '?'}, Column ${existingLoc.column ?? '?'}):
   Tag: <${existingEntry.tag || 'unknown'}>
   Attributes: ${JSON.stringify(existingEntry.attributes || {}, null, 2)}
   Content: ${existingEntry.text || existingEntry.kids || 'N/A'}

🔍 DUPLICATE ENTRY (Line ${dupLoc.line ?? '?'}, Column ${dupLoc.column ?? '?'}):
   Tag: <${entry.tag || tag || 'unknown'}>
   Attributes: ${JSON.stringify(entry.attributes || attributes || {}, null, 2)}
   Content: ${entry.text || entry.kids || node.text || 'N/A'}

💡 TIP: If these appear to be different elements, they likely have the same text content and are generating the same hash ID. Add explicit id="unique_name" attributes to distinguish them.`,
            location: { provenance: [source, ...parseDeps], ...dupLoc },
            technical: {
              duplicateId: storeId,
              existingEntry: existingEntry,
              duplicateEntry: entry
            }
          });
          // Skip the duplicate, keep the first one
          return;
        }
        if (!idMap[storeId]) idMap[storeId] = {};
        idMap[storeId][lang] = entry;
      },
      // Pass errors array to parsers so they can accumulate errors too
      errors
    });
    } catch (parserError: any) {
      // The block's parser threw. Downgrade to a recoverable ErrorNode (same
      // shape/handling as the invalid-id and bad-attribute paths above) so the
      // rest of the file still parses and the failure is visible in the tree.
      const appError = toAppError(parserError);
      const errorObj = {
        type: 'parse_error' as const,
        title: `Parser error in <${tag}> in ${source}`,
        message: appError.message,
        location: { provenance: [source, ...parseDeps], ...offsetToLineCol(xml, sourceOffset) },
        // Keep technical JSON-safe (idMap is dispatched as olxjson / saved).
        technical: {
          tag,
          id,
          ...(appError.stack ? { stack: appError.stack } : {}),
        },
      };
      errors.push(errorObj);
      const lang = resolveElementLanguage(parsedAttributes, currentLang, metadataLang);
      if (!idMap[id]) idMap[id] = {};
      idMap[id][lang] = {
        id, tag: 'ErrorNode', attributes: errorObj, source, parseDeps,
        rawParsed: node, kids: [], parseError: true,
        lang,
        ...(sourceOffset !== undefined ? { _sourceOffset: sourceOffset } : {}),
        ...(metadata || {})
      };
      parsedIds.push(id);
      return { type: 'block', id };
    }

    // Structural validation: check children after they are parsed
    if (Component?.validateChildren) {
      const fallbackLang = idMap[id] ? variantMapKeys(idMap[id])[0] : undefined;
      const entry = idMap[id]?.[currentLang] ?? (fallbackLang ? idMap[id]?.[fallbackLang] : undefined);
      const kids = entry?.kids;
      const childErrors = Component.validateChildren(kids, idMap);
      if (childErrors && childErrors.length > 0) {
        const errorList = childErrors.map(e => `  - ${e}`).join('\n');
        errors.push({
          type: 'attribute_validation',
          title: `Invalid children in <${tag}> in ${source}`,
          message: `Invalid children for <${tag} id="${id}">:\n${errorList}`,
          location: { provenance: [source, ...parseDeps], ...offsetToLineCol(xml, sourceOffset) },
          technical: { tag, id, childErrors }
        });
      }
    }

    parsedIds.push(id);
    return { type: 'block', id };
  }

  // Parsed OLX can include comment nodes or whitespace before the actual
  // root block. Find the first element node so we don't accidentally treat a
  // comment as the root of the document.
  const rootNode = Array.isArray(parsedTree)
    ? parsedTree.find(isElementNode)
    : parsedTree;

  let fileMetadata: OLXMetadata = OLXMetadataSchema.parse({});

  if (rootNode) {
    // We take the ID from the result of `parseNode` rather than directly from
    // `rootNode`. The parser can rewrite the ID (for example when handling
    // `<Use ref="...">`), so the value returned here reflects the final ID
    // stored in the ID map.
    // Pass parsedTree as siblings so root can extract metadata from preceding comments
    const rootIndex = Array.isArray(parsedTree) ? parsedTree.indexOf(rootNode) : -1;

    const parsedRoot = await parseNode(rootNode, parsedTree, rootIndex);
    if (parsedRoot?.id) {
      rootId = parsedRoot.id;
    }
  }

  if (Array.isArray(parsedTree)) {
    // The remaining nodes are parsed only for their side effects. Each call to
    // `parseNode` populates `idMap` via `storeEntry`; the return values are not
    // used here. Skip rootNode since we already parsed it above.
    for (let i = 0; i < parsedTree.length; i++) {
      const n = parsedTree[i];
      if (n !== rootNode) {
        await parseNode(n, parsedTree, i);
      }
    }
  }

  if (!rootId && parsedIds.length) rootId = parsedIds[0];

  // Post-parse: check input/grader type compatibility via Zod schemas.
  // Best-effort — only checks same-file targets and direct children.
  // The runtime check in actions.tsx is the authoritative fallback.
  for (const blockId of parsedIds) {
    const variants = idMap[blockId];
    if (!variants) continue;
    const variant = variantMapKeys(variants)[0];
    const entry = variant ? variants[variant] : undefined;
    if (!entry?.tag) continue;
    const graderBlock = BLOCK_REGISTRY[entry.tag];
    if (!graderBlock?.isGrader || !graderBlock.inputSchema) continue;

    // Find input IDs: explicit target attribute, or child blocks with isInput.
    // Target values are either Zod-validated StateRef[] (from z_stateRefList) or
    // bare ref strings (from CapaProblem auto-wiring). Resolve via the canonical
    // stateKeyForGlobalRef path — handles already-qualified refs correctly and
    // extracts DefinitionKeys from scoped refs (e.g., "list:#0:answer" → ["list", "answer"]).
    let inputIds: string[] = [];
    const target = entry.attributes?.target;
    if (target) {
      const rawIds = Array.isArray(target) ? target.filter((value): value is string => typeof value === 'string')
        : typeof target === 'string' ? target.split(',').map(s => s.trim()) : [];
      inputIds = rawIds.flatMap(s => {
        const ref = parseAnyStateRef(s);
        const stateKey = stateKeyForGlobalRef(ref, ns);
        return allDefinitionKeysFromStateKey(stateKey);
      });
    } else if (Array.isArray(entry.kids)) {
      inputIds = entry.kids
        .filter(isBlockKid)
        .map(k => k.id)
        .filter(id => {
          const v = idMap[id];
          if (!v) return false;
          const variant = variantMapKeys(v)[0];
          const e = variant ? v[variant] : undefined;
          return e?.tag && BLOCK_REGISTRY[e.tag]?.isInput;
        });
    }

    for (const inputId of inputIds) {
      const inputVariants = idMap[inputId];
      if (!inputVariants) continue; // Cross-file or unresolvable — skip
      const inputVariant = variantMapKeys(inputVariants)[0];
      const inputEntry = inputVariant ? inputVariants[inputVariant] : undefined;
      if (!inputEntry?.tag) continue;
      const inputBlock = BLOCK_REGISTRY[inputEntry.tag];
      if (!inputBlock?.valueSchema) continue;

      if (!isZodCompatible(inputBlock.valueSchema, graderBlock.inputSchema)) {
        errors.push({
          type: 'attribute_validation',
          title: `Type mismatch: <${entry.tag}> with <${inputEntry.tag}> in ${source}`,
          message: `<${entry.tag}> expects ${describeZodType(graderBlock.inputSchema)} input, but <${inputEntry.tag}> provides ${describeZodType(inputBlock.valueSchema)}.`,
          location: { provenance: [source, ...parseDeps], ...offsetToLineCol(xml, entry._sourceOffset) },
          technical: {
            graderId: blockId,
            graderTag: entry.tag,
            inputId,
            inputTag: inputEntry.tag,
          }
        });
      }
    }
  }

  return { ids: parsedIds, idMap, root: rootId, errors };
}

/** Generate a stable auto-ID for a node without an explicit id= attribute.
 *  Returns a branded DefinitionRef via makeSystemDefinitionRef ("_" + hash).
 *  Authors cannot collide — bare "_foo" refs are rejected at parse time. */
function createId(node): DefinitionRef {
  const canonical = JSON.stringify(node);
  return makeSystemDefinitionRef(SHA1(canonical).toString());
}
