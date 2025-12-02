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

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { COMPONENT_MAP } from '@/components/componentMap';
import { transformTagName } from '@/lib/content/xmlTransforms';

import * as parsers from '@/lib/content/parsers';
import { Provenance, IdMap, OLXLoadingError } from '@/lib/types';
import { formatProvenanceList } from '@/lib/storage/provenance';

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
      rawParsed: entry.rawParsed,
      idMap,
      provenance,
      entry,
      children: entry.kids
    });
  } else {
    throw new Error(`Invalid requiresUniqueId value for component ${tag}: expected boolean, 'children', or function but got ${typeof requiresUniqueId}`);
  }
}

export async function parseOLX(
  xml,
  provenance: Provenance,
  provider?: import('../storage').StorageProvider
) {
  const idMap: IdMap = {};
  const provenanceStr = formatProvenanceList(provenance).join(', ');

  let parsedTree;
  try {
    // Parse first (which applies transforms)
    parsedTree = xmlParser.parse(xml);
  } catch (parseError) {
    // The parser itself will catch malformed XML
    const lines = xml.split('\n');
    const preview = lines.slice(0, 10).map((line, i) => `${i + 1}: ${line}`).join('\n');

    throw new Error(
      `XML parsing error in ${provenanceStr}:\n` +
      `${parseError.message}\n\n` +
      `First 10 lines of content:\n${preview}\n\n` +
      `Check for: unclosed tags, invalid characters, or malformed XML syntax.`
    );
  }

  // Validate the parsed structure instead
  if (!parsedTree || (Array.isArray(parsedTree) && parsedTree.length === 0)) {
    throw new Error(
      `Empty or invalid XML document in ${provenanceStr}.\n` +
      `The document must contain at least one root element.`
    );
  }

  const parsedIds: string[] = [];
  let rootId = '';
  const errors: OLXLoadingError[] = [];

  async function parseNode(node) {
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;

    const attributes = node[':@'] ?? {};

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
      return { type: 'block', id: ref, overrides };
    }

    const id = attributes.id ?? attributes.url_name ?? createId(node);

    const Component = COMPONENT_MAP[tag] || COMPONENT_MAP[tag.charAt(0).toUpperCase() + tag.slice(1)];
    if (!Component) {
      console.warn(`[OLX] No component found for tag: <${tag}> — using defaultParser`);
    }
    const parser = Component?.parser || defaultParser;

    // Parse the node using the component's parser. The parser is responsible
    // for calling `storeEntry` for every piece of data that should be tracked
    // in the ID map. A single node may generate multiple entries this way.
    // The return value of `parseNode` simply exposes the block's primary id
    // and is only used when determining the document's root.
    await parser({
      id,
      rawParsed: node,
      tag,
      attributes,
      provenance,
      provider,
      parseNode,
      storeEntry: (storeId, entry) => {
        if (idMap[storeId]) {
          const requiresUnique = shouldBlockRequireUniqueId(Component, tag, storeId, entry, idMap, provenance);

          if (!requiresUnique) {
            // Allow duplicate IDs for this block type - but still store in idMap
            // We'll overwrite the previous entry to keep the latest one
            idMap[storeId] = entry;
            return;
          }

          // Get detailed information about both the existing and duplicate entries
          const existingEntry = idMap[storeId];
          const existingXml = existingEntry.rawParsed ? JSON.stringify(existingEntry.rawParsed, null, 2) : 'N/A';
          const duplicateXml = entry.rawParsed ? JSON.stringify(entry.rawParsed, null, 2) : 'N/A';

          errors.push({
            type: 'duplicate_id',
            file: formatProvenanceList(provenance).join(', '),
            message: `Duplicate ID "${storeId}" found in ${formatProvenanceList(provenance).join(', ')}. Each element must have a unique id.

🔍 EXISTING ENTRY (Line ${existingEntry.line || '?'}, Column ${existingEntry.column || '?'}):
   Tag: <${existingEntry.tag || 'unknown'}>
   Attributes: ${JSON.stringify(existingEntry.attributes || {}, null, 2)}
   Content: ${existingEntry.text || existingEntry.kids || 'N/A'}
   Full XML: ${existingXml.slice(0, 500)}${existingXml.length > 500 ? '...' : ''}

🔍 DUPLICATE ENTRY (Line ${entry.line || '?'}, Column ${entry.column || '?'}):
   Tag: <${entry.tag || tag || 'unknown'}>
   Attributes: ${JSON.stringify(entry.attributes || attributes || {}, null, 2)}
   Content: ${entry.text || entry.kids || node.text || 'N/A'}
   Full XML: ${duplicateXml.slice(0, 500)}${duplicateXml.length > 500 ? '...' : ''}

💡 TIP: If these appear to be different elements, they likely have the same text content and are generating the same hash ID. Add explicit id="unique_name" attributes to distinguish them.`,
            location: { line: entry.line, column: entry.column },
            technical: {
              duplicateId: storeId,
              existingEntry: existingEntry,
              duplicateEntry: entry,
              existingXml: existingXml,
              duplicateXml: duplicateXml
            }
          });
          // Skip the duplicate, keep the first one
          return;
        }
        idMap[storeId] = entry;
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

  if (rootNode) {
    // We take the ID from the result of `parseNode` rather than directly from
    // `rootNode`. The parser can rewrite the ID (for example when handling
    // `<Use ref="...">`), so the value returned here reflects the final ID
    // stored in the ID map.
    const parsedRoot = await parseNode(rootNode);
    if (parsedRoot?.id) rootId = parsedRoot.id;
  }

  if (Array.isArray(parsedTree)) {
    // The remaining nodes are parsed only for their side effects. Each call to
    // `parseNode` populates `idMap` via `storeEntry`; the return values are not
    // used here.
    for (const n of parsedTree) {
      if (n !== rootNode) {
        await parseNode(n);
      }
    }
  }

  if (!rootId && parsedIds.length) rootId = parsedIds[0];

  return { ids: parsedIds, idMap, root: rootId, errors };
}

function createId(node) {
  const attributes = node[':@'] ?? {};
  const id = attributes.url_name ?? attributes.id;
  if (id) return id;

  const canonical = JSON.stringify(node);
  return SHA1(canonical).toString();
}
