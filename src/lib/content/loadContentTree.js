import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { COMPONENT_MAP } from '@/components/componentMap';
import { transformTagName } from '@/lib/content/xmlTransforms';

import * as parsers from '@/lib/olx/parsers';

const defaultParser = parsers.xblocks;

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
  const xmlFiles = await getXmlFilesRecursively(contentDir);
  const seenFiles = new Set();

  for (const fullPath of xmlFiles) {
    const relativePath = path.relative(contentDir, fullPath);
    seenFiles.add(relativePath);

    const stat = await fs.stat(fullPath);
    const prev = contentStore.byFile[relativePath];

    if (!prev || stat.mtimeMs > prev.mtimeMs) {
      const xml = await fs.readFile(fullPath, 'utf-8');
      const parsed = xmlParser.parse(xml);

      if (prev?.nodes) {
        for (const id of prev.nodes) {
          delete contentStore.byId[id];
        }
      }

      const indexedIds = indexParsed(parsed, relativePath);

      contentStore.byFile[relativePath] = {
        mtimeMs: stat.mtimeMs,
        parsed,
        nodes: indexedIds
      };
    }
  }

  // Remove deleted files
  for (const oldFile of Object.keys(contentStore.byFile)) {
    if (!seenFiles.has(oldFile)) {
      for (const id of contentStore.byFile[oldFile].nodes) {
        delete contentStore.byId[id];
      }
      delete contentStore.byFile[oldFile];
    }
  }

  return {
    parsed: contentStore.byFile,
    idMap: contentStore.byId
  };
}

function indexParsed(parsedTree, sourceFile) {
  const indexed = [];

  function parseNode(node) {
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;

    const attributes = node[':@'] || {};

    if(attributes.ref) {
      if (tag !== 'Use') {
        throw new Error(
          `Invalid 'ref' attribute on <${tag}> in ${sourceFile}. Only <use> elements may have 'ref'.`
        );
      }

      // 2. Ensure no additional children
      // Children are present if there are any keys other than 'Use', ':@', '#text', '#comment'
      const childKeys = Object.keys(node).filter(
        k => !['Use', ':@', '#text', '#comment'].includes(k)
      );
      if (childKeys.length > 0) {
        throw new Error(
          `<Use ref="..."> in ${sourceFile} must not have child elements. Found children: ${childKeys.join(', ')}`
        );
      }

      // 3. Ensure no additional attributes
      const allowedAttrs = ['ref'];
      const extraAttrs = Object.keys(attributes).filter(attr => !allowedAttrs.includes(attr));
      if (extraAttrs.length > 0) {
        throw new Error(
          `<Use ref="..."> in ${sourceFile} must not have additional attributes (${extraAttrs.join(', ')}). ` +
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
      sourceFile,
      // Actions
      parseNode,
      storeEntry: (id, entry) => {
        if (contentStore.byId[id]) {
          throw new Error(
            `Duplicate ID "${id}" found in ${sourceFile}. Each element must have a unique id.`
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

function createId(node) {
  const attributes = node[':@'] || {};
  const id = attributes.url_name || attributes.id;
  if (id) return id;

  const canonical = JSON.stringify(node);
  return crypto.createHash('sha1').update(canonical).digest('hex');
}

async function getXmlFilesRecursively(dir) {
  const files = [];

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getXmlFilesRecursively(fullPath));
    } else if (entry.isFile() && fullPath.endsWith('.xml')) {
      files.push(fullPath);
    }
  }

  return files;
}
