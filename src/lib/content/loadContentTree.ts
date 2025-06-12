import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { COMPONENT_MAP } from '@/components/componentMap';
import { transformTagName } from '@/lib/olx/xmlTransforms';

import { StorageProvider, FileStorageProvider } from '@/lib/storage';

import * as parsers from '@/lib/olx/parsers';
import { Provenance, formatProvenance } from '@/lib/types';

const defaultParser = parsers.blocks.parser;

const contentStore = {
  byProvenance: {},
  byId: {}
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  commentPropName: '#comment',
  preserveTextNodeWhiteSpaces: true,
  trimValues: false,
  transformTagName
});


export async function loadContentTree(provider: StorageProvider = new FileStorageProvider('./content')) {
  const { added, changed, unchanged, deleted } = await provider.loadXmlFilesWithStats(contentStore.byProvenance);

  deleteNodesByProvenance([...Object.keys(deleted), ...Object.keys(changed)]);

  for (const [srcId, fileInfo] of Object.entries({ ...added, ...changed })) {
    const indexedIds = indexXml(fileInfo.content, [srcId]);
    contentStore.byProvenance[srcId] = {
      nodes: indexedIds,
      ...fileInfo
    };
  }

  return {
    parsed: contentStore.byProvenance,
    idMap: contentStore.byId
  };
}

// Helper: remove all nodes for deleted/changed files
function deleteNodesByProvenance(relativePaths) {
  for (const relPath of relativePaths) {
    const prev = contentStore.byProvenance[relPath];
    if (prev?.nodes) {
      for (const id of prev.nodes) {
        delete contentStore.byId[id];
      }
    }
    delete contentStore.byProvenance[relPath];
  }
}


function indexXml(xml: string, provenance: Provenance) {
  const parsedTree = xmlParser.parse(xml);
  const indexed = [];

  function parseNode(node) {
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;

    const attributes = node[':@'] || {};

    if (attributes.ref) {
      if (tag !== 'Use') {
        throw new Error(
          `Invalid 'ref' attribute on <${tag}> in ${formatProvenance(provenance)}. Only <use> elements may have 'ref'.`
        );
      }

      // 2. Ensure no additional kids
      // Kids are present if there are any keys other than 'Use', ':@', '#text', '#comment'
      const childKeys = Object.keys(node).filter(
        k => !['Use', ':@', '#text', '#comment'].includes(k)
      );
      if (childKeys.length > 0) {
        throw new Error(
          `<Use ref="..."> in ${formatProvenance(provenance)} must not have kid elements. Found kids: ${childKeys.join(', ')}`
        );
      }

      // 3. Ensure no additional attributes
      const allowedAttrs = ['ref'];
      const extraAttrs = Object.keys(attributes).filter(attr => !allowedAttrs.includes(attr));
      if (extraAttrs.length > 0) {
        throw new Error(
          `<Use ref="..."> in ${formatProvenance(provenance)} must not have additional attributes (${extraAttrs.join(', ')}). ` +
          `In the future, these will go into an 'overrides' dictionary.`
        );
      }
      return { type: 'block', id: attributes.ref };
    }

    const id = attributes.id || attributes.url_name || createId(node);

    const Component = COMPONENT_MAP[tag] || COMPONENT_MAP[tag.charAt(0).toUpperCase() + tag.slice(1)];
    if (!Component) {
      console.warn(`[OLX] No component found for tag: <${tag}> — using defaultParser`);
    }
    const parser = Component?.parser || defaultParser;

    parser({
      // Node data
      id,
      rawParsed: node,
      tag,
      attributes,
      provenance,
      // Actions
      parseNode,
      storeEntry: (id, entry) => {
        if (contentStore.byId[id]) {
          throw new Error(
            `Duplicate ID "${id}" found in ${formatProvenance(provenance)}. Each element must have a unique id.`
          );
        }
        contentStore.byId[id] = entry;
      },
    });

    indexed.push(id);
    return { type: 'block', id };
  }

  if (Array.isArray(parsedTree)) {
    parsedTree.forEach(parseNode);
  } else {
    parseNode(parsedTree);
  }

  return indexed;
}


// Every node needs an ID.
//
// Helper to make the ID for a node. Check if it has a url_name or an
// id, and if not, make a sha hash.
function createId(node) {
  const attributes = node[':@'] || {};
  const id = attributes.url_name || attributes.id;
  if (id) return id;

  const canonical = JSON.stringify(node);
  return crypto.createHash('sha1').update(canonical).digest('hex');
}

// Helper: walk directory, collect .xml/.olx files with stat info and detect changes
