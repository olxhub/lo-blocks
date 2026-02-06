// src/lib/content/parseOLX.ts
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

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { transformTagName } from '@/lib/content/xmlTransforms';

import * as parsers from '@/lib/content/parsers';
import { Provenance, IdMap, OLXLoadingError, OlxReference, OlxKey, JSONValue } from '@/lib/types';
import { formatProvenanceList } from '@/lib/lofs/provenance';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import { OLXMetadataSchema, type OLXMetadata } from '@/lib/content/metadata';

const defaultParser = parsers.blocks().parser;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  commentPropName: '#comment',
  // TODO what is this used for? We get an error when building
  // that `preseverTextNodeWhiteSpaces is not a known property
  // of XMLParser.
  // preserveTextNodeWhiteSpaces: true,
  trimValues: false,

  // CRITICAL: Prevent automatic type conversion - see parseOLX.test.js for details
  parseTagValue: false,       // Keep tag text content as strings (not numbers/booleans)
  parseAttributeValue: false, // Keep attribute values as strings

  transformTagName
});

/**
 * Determines if a block type requires unique IDs based on its configuration.
 *
 * @param Component - The block component (may be undefined for unknown components)
 * @param tag - The XML tag name
 * @param storeId - The ID being checked
 * @param entry - The entry being stored
 * @param idMap - The current ID map
 * @param provenance - File/location information
 * @returns boolean indicating if unique IDs are required
 */
function shouldBlockRequireUniqueId(Component, tag, storeId, entry, idMap, provenance) {
  if (!Component) {
    // Default behavior for unknown components: require unique IDs
    return true;
  }

  const requiresUniqueId = Component.requiresUniqueId;

  if (requiresUniqueId === undefined) {
    // Default behavior: require unique IDs (backward compatibility)
    return true;
  } else if (typeof requiresUniqueId === 'boolean') {
    return requiresUniqueId;
  } else if (requiresUniqueId === 'children') {
    // TODO: Implement 'children' mode
    //
    // This mode should recursively check if ANY child blocks require unique IDs.
    // Implementation would:
    // 1. Parse/examine the child nodes of this block
    // 2. For each child, get its Component and check its requiresUniqueId setting
    // 3. If ANY child requires unique IDs, return true for this block too
    // 4. Otherwise return false
    //
    // Use case example: A Markdown block with embedded interactive elements
    // - Basic Markdown blocks can have duplicate IDs
    // - But if Markdown contains interactive widgets, those need unique IDs
    // - So the container Markdown would inherit the uniqueness requirement
    //
    // This enables context-sensitive ID validation based on actual content.
    throw new Error(`requiresUniqueId: 'children' mode is not yet implemented for component ${tag}`);
  } else if (typeof requiresUniqueId === 'function') {
    return requiresUniqueId({
      id: storeId,
      attributes: entry.attributes,
      tag: entry.tag,
      idMap,
      provenance,
      entry,
      children: entry.kids
    });
  } else {
    throw new Error(`Invalid requiresUniqueId value for component ${tag}: expected boolean, 'children', or function but got ${typeof requiresUniqueId}`);
  }
}

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
 * @param provenance - Current provenance chain for error reporting
 * @param errors - Array to collect parsing errors
 * @returns Three possible outcomes:
 *   - null: No YAML frontmatter found (comment doesn't have --- delimiters)
 *   - OLXLoadingError: Metadata frontmatter found but has syntax/validation errors
 *   - OLXMetadata: Valid metadata successfully parsed and validated
 */
function extractMetadataFromComment(
  commentText: any,
  provenance: Provenance,
  errors: OLXLoadingError[]
): OLXMetadata | OLXLoadingError | null {
  const file = provenance.join(' → ');

  // Fail early if comment structure is invalid
  //
  // This is likely obsolete / overly-defensive, and the next two if
  // statements should be removed if these issues are never triggered.

  if (commentText === undefined || commentText === null) {
    const error: OLXLoadingError = {
      type: 'parse_error',
      file,
      message: 'Internal parser error: Comment node found but text content is missing. This may indicate a parser configuration issue.',
      technical: { commentText }
    };
    errors.push(error);
    return error;
  }

  if (typeof commentText !== 'string') {
    const error: OLXLoadingError = {
      type: 'parse_error',
      file,
      message: `Internal parser error: Comment text has unexpected type '${typeof commentText}' (expected string).`,
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
    const parsed = yaml.load(yamlContent);

    // Validate with Zod schema
    const result = OLXMetadataSchema.safeParse(parsed);

    if (!result.success) {
      // Create teacher-friendly error message
      const issues = result.error.issues.map(issue =>
        `  • ${issue.path.join('.')}: ${issue.message}`
      ).join('\n');

      const error: OLXLoadingError = {
        type: 'metadata_error',
        file,
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
      file,
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
 * @param provenance - Current provenance chain for error reporting
 * @param errors - Array to collect parsing errors (errors are added by extractMetadataFromComment)
 * @returns Metadata object with defaults applied, empty if no valid metadata found
 */
function extractSiblingMetadata(
  siblings: any[] | null,
  nodeIndex: number,
  provenance: Provenance,
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
      const result = extractMetadataFromComment(commentText, provenance, errors);

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
  provenance: Provenance,
  provider?: import('../lofs').StorageProvider
) {
  const idMap: IdMap = {};

  // Validate XML first for better error messages
  const provenanceStr = formatProvenanceList(provenance).join(', ');
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

  const parsedIds: string[] = [];
  let rootId = '';
  const errors: OLXLoadingError[] = [];

  async function parseNode(node, siblings: any[] | null = null, nodeIndex = -1, parentLang: string | undefined = undefined) {
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;

    const attributes = node[':@'] ?? {};

    // Extract metadata from preceding sibling comment
    const metadata = extractSiblingMetadata(siblings, nodeIndex, provenance, errors);

    // Resolve language for this element using cascade:
    // 1. Element's own lang attribute
    // 2. Element's own metadata language (from YAML comment above)
    // 3. Inherited from parent element (carries file-level lang via cascade)
    // 4. Default '*'
    const metadataLang = metadata?.lang;
    const currentLang = resolveElementLanguage(attributes, parentLang, metadataLang);

    if (attributes.ref) {
      if (tag !== 'Use') {
        throw new Error(
          `Invalid 'ref' attribute on <${tag}> in ${formatProvenanceList(provenance).join(', ')}. Only <use> elements may have 'ref'.`
        );
      }

      const childKeys = Object.keys(node).filter(
        k => !['Use', ':@', '#text', '#comment'].includes(k)
      );
      if (childKeys.length > 0) {
        throw new Error(
          `<Use ref="..."> in ${formatProvenanceList(provenance).join(', ')} must not have kid elements. Found kids: ${childKeys.join(', ')}`
        );
      }

      const { ref, ...overrides } = attributes;
      return { type: 'block', id: ref as OlxReference, overrides };
    }

    const id: OlxKey = (attributes.id ?? createId(node)) as OlxKey;

    const Component = BLOCK_REGISTRY[tag] || BLOCK_REGISTRY[tag.charAt(0).toUpperCase() + tag.slice(1)];

    // Validate and transform attributes - use component schema if defined, else base with passthrough
    // Passthrough preserves unknown attrs; strict() rejects unknown (catching typos like scr= vs src=)
    const schema = Component?.attributes ?? baseAttributes.passthrough();
    const result = schema.safeParse(attributes);
    let parsedAttributes = attributes;
    if (!result.success) {
      const zodErrors = result.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
      errors.push({
        type: 'attribute_validation',
        file: formatProvenanceList(provenance).join(', '),
        message: `Invalid attributes for <${tag} id="${id}">:\n${zodErrors}`,
        location: { line: node.line, column: node.column },
        technical: {
          tag,
          id,
          attributes,
          zodError: result.error
        }
      });
    } else {
      // Use transformed attributes (e.g., "true" -> true for booleans)
      parsedAttributes = result.data;

      // Semantic validation beyond what Zod schema can express
      // e.g., NumericalGrader answer must be a valid number, StringGrader regexp must be valid
      if (Component?.validateAttributes) {
        const semanticErrors = Component.validateAttributes(parsedAttributes);
        if (semanticErrors && semanticErrors.length > 0) {
          const errorList = semanticErrors.map(e => `  - ${e}`).join('\n');
          errors.push({
            type: 'attribute_validation',
            file: formatProvenanceList(provenance).join(', '),
            message: `Invalid attributes for <${tag} id="${id}">:\n${errorList}`,
            location: { line: node.line, column: node.column },
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

    // Create a wrapper around parseNode that passes currentLang as parentLang for child elements.
    // This ensures language inheritance works correctly throughout the tree.
    const parseNodeWithLang = (childNode, childSiblings, childIndex) =>
      parseNode(childNode, childSiblings, childIndex, currentLang);

    // Parse the node using the component's parser. The parser is responsible
    // for calling `storeEntry` for every piece of data that should be tracked
    // in the ID map. A single node may generate multiple entries this way.
    // The return value of `parseNode` simply exposes the block's primary id
    // and is only used when determining the document's root.
    await parser({
      id,
      rawParsed: node,
      tag,
      attributes: parsedAttributes,
      provenance,
      provider,
      parseNode: parseNodeWithLang,
      metadata,  // Pass metadata to parser so it can include in entry
      storeEntry: (storeId, entryOrUpdater) => {
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

        // If this is an update to an existing entry, just update it
        if (typeof entryOrUpdater === 'function' && idMap[storeId]?.[lang]) {
          if (!idMap[storeId]) idMap[storeId] = {};
          idMap[storeId][lang] = entry;
          return;
        }

        if (idMap[storeId]?.[lang]) {
          const requiresUnique = shouldBlockRequireUniqueId(Component, tag, storeId, entry, idMap, provenance);

          if (!requiresUnique) {
            // Allow duplicate IDs for this block type - but still store in idMap
            // We'll overwrite the previous entry to keep the latest one
            if (!idMap[storeId]) idMap[storeId] = {};
            idMap[storeId][lang] = entry;
            return;
          }

          // Get detailed information about both the existing and duplicate entries
          const existingEntry = idMap[storeId][lang];

          errors.push({
            type: 'duplicate_id',
            file: formatProvenanceList(provenance).join(', '),
            message: `Duplicate ID "${storeId}" found in ${formatProvenanceList(provenance).join(', ')}. Each element must have a unique id.

🔍 EXISTING ENTRY (Line ${existingEntry.line || '?'}, Column ${existingEntry.column || '?'}):
   Tag: <${existingEntry.tag || 'unknown'}>
   Attributes: ${JSON.stringify(existingEntry.attributes || {}, null, 2)}
   Content: ${existingEntry.text || existingEntry.kids || 'N/A'}

🔍 DUPLICATE ENTRY (Line ${entry.line || '?'}, Column ${entry.column || '?'}):
   Tag: <${entry.tag || tag || 'unknown'}>
   Attributes: ${JSON.stringify(entry.attributes || attributes || {}, null, 2)}
   Content: ${entry.text || entry.kids || node.text || 'N/A'}

💡 TIP: If these appear to be different elements, they likely have the same text content and are generating the same hash ID. Add explicit id="unique_name" attributes to distinguish them.`,
            location: { line: entry.line, column: entry.column },
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

    parsedIds.push(id);
    return { type: 'block', id };
  }

  // Parsed OLX can include comment nodes or whitespace before the actual
  // root block. Find the first element node so we don't accidentally treat a
  // comment as the root of the document.
  const rootNode = Array.isArray(parsedTree)
    ? parsedTree.find(n =>
      !!Object.keys(n).find(k => ![':@', '#text', '#comment'].includes(k))
    )
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

  return { ids: parsedIds, idMap, root: rootId, errors };
}

function createId(node): OlxKey {
  const attributes = node[':@'] ?? {};
  if (attributes.id) return attributes.id as OlxKey;

  const canonical = JSON.stringify(node);
  return SHA1(canonical).toString() as OlxKey;
}
