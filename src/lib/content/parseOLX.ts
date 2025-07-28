// src/lib/content/parseOLX.ts
import SHA1 from 'crypto-js/sha1';

import { XMLParser } from 'fast-xml-parser';
import { COMPONENT_MAP } from '@/components/componentMap';
import { transformTagName } from '@/lib/content/xmlTransforms';

import * as parsers from '@/lib/content/parsers';
import { Provenance, IdMap } from '@/lib/types';
import { formatProvenanceList } from '@/lib/storage/provenance';

const defaultParser = parsers.blocks.parser;

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
  transformTagName
});

export async function parseOLX(
  xml,
  provenance: Provenance,
  provider?: import('../storage').StorageProvider
) {
  const idMap: IdMap = {};
  const parsedTree = xmlParser.parse(xml);
  const parsedIds: string[] = [];
  let rootId = '';

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
          throw new Error(
            `Duplicate ID "${storeId}" found in ${formatProvenanceList(provenance).join(', ')}. Each element must have a unique id.`
          );
        }
        idMap[storeId] = entry;
      },
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

  return { ids: parsedIds, idMap, root: rootId };
}

function createId(node) {
  const attributes = node[':@'] ?? {};
  const id = attributes.url_name ?? attributes.id;
  if (id) return id;

  const canonical = JSON.stringify(node);
  return SHA1(canonical).toString();
}
