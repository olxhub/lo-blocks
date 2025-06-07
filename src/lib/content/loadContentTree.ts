import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { COMPONENT_MAP } from '@/components/componentMap';
import { transformTagName } from '@/lib/olx/xmlTransforms';

import * as parsers from '@/lib/olx/parsers';

const defaultParser = parsers.xblocks.parser;

const contentStore = {
  byFile: {},
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


export async function loadContentTree(contentDir = './content') {
  const { added, changed, unchanged, deleted } = await loadXmlFilesWithStats(contentDir, contentStore.byFile);

  deleteNodesByProvenance([...Object.keys(deleted), ...Object.keys(changed)]);

  for (const [id, fileInfo] of Object.entries({ ...added, ...changed })) {
    const indexedIds = indexXml(fileInfo.content, id);
    contentStore.byFile[id] = {
      nodes: indexedIds,
      ...fileInfo
    };
  }

  return {
    parsed: contentStore.byFile,
    idMap: contentStore.byId
  };
}

// Helper: remove all nodes for deleted/changed files
function deleteNodesByProvenance(relativePaths) {
  for (const relPath of relativePaths) {
    const prev = contentStore.byFile[relPath];
    if (prev?.nodes) {
      for (const id of prev.nodes) {
        delete contentStore.byId[id];
      }
    }
    delete contentStore.byFile[relPath];
  }
}

function indexXml(xml, sourceId) {
  const parsedTree = xmlParser.parse(xml);
  const indexed = [];

  function parseNode(node) {
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;

    const attributes = node[':@'] || {};

    if(attributes.ref) {
      if (tag !== 'Use') {
        throw new Error(
          `Invalid 'ref' attribute on <${tag}> in ${sourceId}. Only <use> elements may have 'ref'.`
        );
      }

      // 2. Ensure no additional children
      // Children are present if there are any keys other than 'Use', ':@', '#text', '#comment'
      const childKeys = Object.keys(node).filter(
        k => !['Use', ':@', '#text', '#comment'].includes(k)
      );
      if (childKeys.length > 0) {
        throw new Error(
          `<Use ref="..."> in ${sourceId} must not have child elements. Found children: ${childKeys.join(', ')}`
        );
      }

      // 3. Ensure no additional attributes
      const allowedAttrs = ['ref'];
      const extraAttrs = Object.keys(attributes).filter(attr => !allowedAttrs.includes(attr));
      if (extraAttrs.length > 0) {
        throw new Error(
          `<Use ref="..."> in ${sourceId} must not have additional attributes (${extraAttrs.join(', ')}). ` +
            `In the future, these will go into an 'overrides' dictionary.`
        );
      }
      return {type: 'xblock', id: attributes.ref};
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
      sourceFile: sourceId, // TODO
      // Actions
      parseNode,
      storeEntry: (id, entry) => {
        if (contentStore.byId[id]) {
          throw new Error(
            `Duplicate ID "${id}" found in ${sourceId}. Each element must have a unique id.`
          );
        }
        contentStore.byId[id] = entry;
      },
    });

    indexed.push(id);
    return {type: 'xblock', id};
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
export async function loadXmlFilesWithStats(dir, previous = {}) {
  function olxFile(entry, fullPath) {
    const fileName = entry.name || fullPath.split('/').pop();
    return (
      entry.isFile() &&
      (fullPath.endsWith('.xml') || fullPath.endsWith('.olx')) &&
      !fileName.includes('~') &&
      !fileName.includes('#') &&
      !fileName.startsWith('.')
    );
  }

  function fileChanged(statA, statB) {
    if (!statA || !statB) return true;
    return (
      statA.size !== statB.size ||
      statA.mtimeMs !== statB.mtimeMs ||
      statA.ctimeMs !== statB.ctimeMs
    );
  }

  const found = {};
  const added = {};
  const changed = {};
  const unchanged = {};

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (olxFile(entry, fullPath)) {
        const id = `file://${fullPath}`;
        const stat = await fs.stat(fullPath);
        found[id] = true;
        const prev = previous[id];
        if (prev) {
          if (fileChanged(prev.stat, stat)) {
            const content = await fs.readFile(fullPath, 'utf-8');
            changed[id] = { id, stat, content };
          } else {
            unchanged[id] = prev;
          }
        } else {
          const content = await fs.readFile(fullPath, 'utf-8');
          added[id] = { id, stat, content };
        }
      }
    }
  }

  await walk(dir);

  // Files in previous, but not found now = deleted
  const deleted = Object.keys(previous)
    .filter(id => !(id in found))
    .reduce((out, id) => {
      out[id] = previous[id];
      return out;
    }, {});

  return { added, changed, unchanged, deleted };
}

export const __testables = {
  loadXmlFilesWithStats
};
