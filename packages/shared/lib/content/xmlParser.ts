// packages/shared/lib/content/xmlParser.ts
//
// The shared fast-xml-parser instance and fragment-level helpers.
//
// Registry-free on purpose: blueprints (Chat, LiquidTemplate) parse OLX
// fragments at parse time via parseXmlFragment. Importing that from
// parseOLX.ts — which imports BLOCK_REGISTRY — created a blueprint →
// registry import cycle that only worked under one module-initialization
// order. Pure XML machinery lives here; parseOLX imports it downward.

import { XMLParser } from 'fast-xml-parser';
import { transformTagName } from '@/lib/content/xmlTransforms';

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  commentPropName: '#comment',
  trimValues: false,              // Preserve whitespace in text nodes

  // CRITICAL: Prevent automatic type conversion - see parseOLX.test.js for details
  parseTagValue: false,       // Keep tag text content as strings (not numbers/booleans)
  parseAttributeValue: false, // Keep attribute values as strings

  // Attach per-node position info. Accessed via XMLParser.getMetaDataSymbol();
  // fast-xml-parser stores { startIndex } on a Symbol key so it is invisible
  // to Object.keys / JSON.stringify / structural walks. Consumers who want
  // real line/column convert startIndex against the original xml string.
  //
  // Heads-up: this option is genuinely undocumented in most places — ChatGPT,
  // Claude, and general web search will all confidently tell you it doesn't
  // exist. It does. The one piece of real upstream docs lives in an
  // awkwardly-named directory ("v4, v5", with the comma) in the repo:
  //   https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/docs/v4,%20v5/2.XMLparseOptions.md#capturemetadata
  // Local confirmation in node_modules/fast-xml-parser:
  //   src/xmlparser/OptionsBuilder.js   — default `captureMetaData: false`
  //   src/fxp.d.ts                       — `captureMetaData?: boolean`,
  //                                        `interface XMLMetaData { startIndex?: number }`,
  //                                        `static getMetaDataSymbol(): Symbol`
  //   src/xmlparser/OrderedObjParser.js  — honored under `preserveOrder: true`
  //   src/xmlparser/xmlNode.js           — actually attaches the symbol to children
  captureMetaData: true,

  transformTagName
});

/** True if a parsed FXP node represents an XML element (not text/comment). */
export function isElementNode(node: any): boolean {
  return typeof node === 'object' && node !== null &&
    Object.keys(node).some(k => k !== '#text' && k !== '#comment' && k !== ':@');
}

/**
 * Parse an OLX XML fragment and return its element nodes.
 *
 * Uses the same XMLParser config as parseOLX so behavior is consistent.
 * Filters out text-only and comment-only nodes — returns only elements
 * (nodes that have at least one key besides #text, #comment, :@).
 *
 * Used by Chat.ts postprocess to parse inline EmbedBlock OLX and by
 * LiquidTemplate without duplicating the parser config.
 */
export function parseXmlFragment(xml: string): any[] {
  const tree = xmlParser.parse(xml);
  const nodes = Array.isArray(tree) ? tree : [tree];
  return nodes.filter(isElementNode);
}

/**
 * Symbol key under which fast-xml-parser stores per-node metadata.
 *
 * The upstream type declares this as `Symbol` (the constructor type) rather
 * than `symbol` (the primitive type), which TypeScript refuses to use as an
 * index. Cast once here so callers can write `node[XML_META]` cleanly.
 */
export const XML_META = XMLParser.getMetaDataSymbol() as unknown as symbol;
