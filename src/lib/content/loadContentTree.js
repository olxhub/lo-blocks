import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import { COMPONENT_MAP } from '@/components/componentMap';
import { transformTagName } from '@/lib/content/xmlTransforms';

import * as parsers from '@/lib/olx/parsers';

const defaultParser = parsers.xblocks;

const contentCache = {
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
    const prev = contentCache.byFile[relativePath];

    if (!prev || stat.mtimeMs > prev.mtimeMs) {
      const xml = await fs.readFile(fullPath, 'utf-8');
      const parsed = xmlParser.parse(xml);

      if (prev?.nodes) {
        for (const id of prev.nodes) {
          delete contentCache.byId[id];
        }
      }

      const indexedIds = indexParsed(parsed, relativePath);

      contentCache.byFile[relativePath] = {
        mtimeMs: stat.mtimeMs,
        parsed,
        nodes: indexedIds
      };
    }
  }

  // Remove deleted files
  for (const oldFile of Object.keys(contentCache.byFile)) {
    if (!seenFiles.has(oldFile)) {
      for (const id of contentCache.byFile[oldFile].nodes) {
        delete contentCache.byId[id];
      }
      delete contentCache.byFile[oldFile];
    }
  }

  return {
    parsed: contentCache.byFile,
    idMap: contentCache.byId
  };
}

function indexParsed(parsedTree, sourceFile) {
  const indexed = [];

  function parseNode(node) {
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;

    const attributes = node[':@'] || {};
    const element = node[tag];
    const id = attributes.id || attributes.url_name || createId(node);

    const Component = COMPONENT_MAP[tag] || COMPONENT_MAP[tag.charAt(0).toUpperCase() + tag.slice(1)];
    if (!Component) {
      console.warn(`[OLX] No component found for tag: <${tag}> — using defaultParser`);
    }
    const parser = Component?.parser || defaultParser;
    //console.log(`[OLX] Using parser: ${parser} / ${parser.name} for tag: <${tag}>`);

    const children = parser({
      rawParsed: element,
      tag,
      attributes,
      parse: parseNode,
      sourceFile
    }) || [];

    const entry = {
      id,
      tag,
      attributes,
      children,
      rawParsed: node,
      sourceFile
    };

    if (shouldUpdateExistingEntry(contentCache.byId[id], entry)) {
      contentCache.byId[id] = entry;
    }

    indexed.push(id);
    return id;
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

function shouldUpdateExistingEntry(existing, incoming) {
  if (!existing) return true;

  const hasContent = (entry) => {
    const attrs = entry.attributes || {};
    const meaningful = Object.keys(attrs).filter(k => k !== 'id' && k !== 'url_name');
    return meaningful.length > 0 || (entry.children || []).length > 0;
  };

  const incomingHas = hasContent(incoming);
  const existingHas = hasContent(existing);

  if (incomingHas && !existingHas) return true;

  if (existingHas && incomingHas) {
    console.warn(`[OLX Parse Error] Duplicate content for id="${incoming.id}"`);
    console.warn(`First seen in ${existing.sourceFile}, then in ${incoming.sourceFile}`);
    throw new Error(`Duplicate definition for id="${incoming.id}" with conflicting content.`);
  }

  return false;
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
