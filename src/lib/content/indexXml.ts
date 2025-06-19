// src/lib/content/indexXml.ts
import { XMLParser } from 'fast-xml-parser';
import { COMPONENT_MAP } from '@/components/componentMap';
import * as parsers from '@/lib/content/parsers';
import { Provenance } from '@/lib/types';
import { formatProvenance } from '@/lib/storage/provenance';
import SHA1 from 'crypto-js/sha1';

const defaultParser = parsers.blocks.parser;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  commentPropName: '#comment',
  preserveTextNodeWhiteSpaces: true,
  trimValues: false,
  transformTagName: undefined as any, // to be provided by caller
});

export function setTagNameTransformer(transformer: (tag: string) => string) {
  (xmlParser as any).options.transformTagName = transformer;
}

export function indexXml(
  xml: string,
  provenance: Provenance,
  idMap: Record<string, any>
) {
  const parsedTree = xmlParser.parse(xml);
  const indexed: string[] = [];

  function parseNode(node: any): any {
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;

    const attributes = node[':@'] || {};

    if (attributes.ref) {
      if (tag !== 'Use') {
        throw new Error(
          `Invalid 'ref' attribute on <${tag}> in ${formatProvenance(provenance)}. Only <use> elements may have 'ref'.`
        );
      }
      const childKeys = Object.keys(node).filter(k => !['Use', ':@', '#text', '#comment'].includes(k));
      if (childKeys.length > 0) {
        throw new Error(
          `<Use ref="..."> in ${formatProvenance(provenance)} must not have kid elements. Found kids: ${childKeys.join(', ')}`
        );
      }
      const allowedAttrs = ['ref'];
      const extraAttrs = Object.keys(attributes).filter(attr => !allowedAttrs.includes(attr));
      if (extraAttrs.length > 0) {
        throw new Error(
          `<Use ref="..."> in ${formatProvenance(provenance)} must not have additional attributes (${extraAttrs.join(', ')}). In the future, these will go into an 'overrides' dictionary.`
        );
      }
      return { type: 'block', id: attributes.ref };
    }

    const id = attributes.id || attributes.url_name || createId(node);
    if (!attributes.id) attributes.id = id;

    const Component = COMPONENT_MAP[tag] || COMPONENT_MAP[tag.charAt(0).toUpperCase() + tag.slice(1)];
    if (!Component) {
      console.warn(`[OLX] No component found for tag: <${tag}> — using defaultParser`);
    }
    const parser = Component?.parser || defaultParser;

    parser({
      id,
      rawParsed: node,
      tag,
      attributes,
      provenance,
      parseNode,
      storeEntry: (entryId: string, entry: any) => {
        if (idMap[entryId]) {
          throw new Error(
            `Duplicate ID "${entryId}" found in ${formatProvenance(provenance)}. Each element must have a unique id.`
          );
        }
        idMap[entryId] = entry;
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


export function createId(node: any) {
  const attributes = node[':@'] || {};
  const id = attributes.url_name || attributes.id;
  if (id) return id;

  const canonical = JSON.stringify(node);
  return SHA1(canonical).toString();
}
