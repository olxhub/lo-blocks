// src/lib/content/parsers.ts
//
// OLX content parsers - composable utilities for processing Learning Observer XML content.
//
// Provides a parser combinator library for transforming OLX (Open Learning XML) into
// the internal block representation. Key parsers include:
//
// - `childParser()`: Decorator for simple parser functions (handles the 95% case of just transforming children)
// - `blocks`: Processes lists of block elements (filters out text/comments)
// - `blocks.allowHTML()`: Same as blocks but includes HTML tags and text as mixed content
// - `text`: Extracts plain text content with whitespace handling options
// - `peggyParser()`: Integrates PEG grammars for domain-specific formats
// - `xml`: Reconstructs XML as a string (lossy - use sparingly)
// - `ignore`: Returns empty kids array (for blocks that don't need child parsing)
//
// Preserves provenance (file/line info) for debugging and authoring.
//
// Future: An `xmljson` parser could pass through raw fast-xml-parser JSON for blocks
// that need to do their own XML processing. Not currently implemented.
//
import { XMLBuilder } from 'fast-xml-parser';
import type { OLXLoadingError, OlxReference, OlxKey } from '@/lib/types';
import { isContentFile, CATEGORY, extensionsWithDots } from '@/lib/util/fileTypes';

// === Setup ===

// HACK: Fallback for going back from parsed XML -> text
// This is not guaranteed to be identical to the source,
// so may lead to bugs.
//
// We should decide if this is a good idea.
const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  format: true,
  indentBy: '  ',
  suppressEmptyNode: false
});

// TODO: Should be process.env.NODE_ENV === 'production' or a config flag
//
// We would want to test both pathways before we do that, so for now,
// we flip manually here.
const prod = false;

// === Utilities ===

/**
 * Resolves and loads content from an external file via the `src` attribute.
 *
 * Handles file:// provenance resolution and returns both the loaded content
 * and updated provenance chain.
 *
 * @param options.src - The src attribute value (relative path)
 * @param options.provider - Storage provider for reading files
 * @param options.provenance - Current provenance chain
 * @returns { text, provenance } - Loaded content and updated provenance
 */
async function loadExternalSource({
  src,
  provider,
  provenance
}: {
  src: string;
  provider: any;
  provenance: string[];
}): Promise<{ text: string; provenance: string[] }> {
  if (!provider) {
    throw new Error('No storage provider supplied for src attribute');
  }

  // Validate file extension before loading (defense-in-depth)
  if (!isContentFile(src)) {
    const allowed = extensionsWithDots(CATEGORY.content).join(', ');
    throw new Error(`Invalid src file type: "${src}". Allowed extensions: ${allowed}`);
  }

  const lastProv = provenance?.[provenance.length - 1];

  // Resolve src against the current file's location to get a canonical
  // SafeRelativePath — same idea as OlxReference → OlxKey for block IDs.
  const resolved = provider.resolveRelativePath(lastProv, src);

  // Let the provider construct provenance — it knows its own scheme
  // (file://, memory://, postgres://, etc.). Parsers don't need to.
  const newProvenance = [...provenance, provider.toProvenanceURI(resolved)];

  const { content } = await provider.read(resolved);
  return { text: content, provenance: newProvenance };
}

/**
 * Extracts raw text content from a single XML node.
 */
function extractTextFromSingleNode(node) {
  if ('#text' in node && typeof node['#text'] === 'string') {
    return node['#text'];
  } else if ('cdata' in node && Array.isArray(node.cdata)) {
    let cdataResult = '';
    for (const c of node.cdata) {
      if (typeof c === 'object' && '#text' in c) {
        cdataResult += c['#text'];
      } else {
        throw new Error(`Malformed CDATA structure: ${JSON.stringify(node)}`);
      }
    }
    return cdataResult;
  } else if (Object.keys(node).length > 0) {
    throw new Error(`XML found in text data: ${JSON.stringify(node)}`);
  }
  return '';
}

/**
 * Reconstructs XML as fallback when text extraction fails.
 */
function reconstructXmlAsFallback(rawParsed, error) {
  console.warn('⚠️', error);
  if (typeof prod !== 'undefined' && prod) {
    const poorlyReconstructedText = builder.build({ fakeRoot: rawParsed })
      .split('<fakeRoot>').join('')
      .split('</fakeRoot>').join('')
      .trim() + '\n';
    return {
      warning: error,
      type: 'text',
      text: poorlyReconstructedText
    };
  }
  throw new Error(error);
}

/**
 * Extracts text content from parsed XML node array with configurable post-processing.
 *
 * Accepts an array of parsed XML nodes (as returned by fast-xml-parser),
 * combining all `#text` and `cdata` content into a single string.
 *
 * - If any node contains unexpected keys (i.e., not `#text` or `cdata`), the function fails.
 * - If `prod` is true, it returns a fallback object on failure instead of throwing.
 * - Post-processing can preserve or modify whitespace as needed.
 *
 * @param {Array<Object>} rawParsed - An array of parsed XML content nodes.
 * @param {Object} options - Processing options.
 * @param {boolean} options.preserveWhitespace - If true, preserves raw whitespace; if false, trims and adds newline.
 * @returns {Object|string} - `{ text: string, type: 'text' }` or raw string, or fallback object on failure.
 */
function extractTextFromXmlNodes(rawParsed, { preserveWhitespace = false } = {}) {
  if (!Array.isArray(rawParsed)) {
    const error = `Expected rawParsed to be an array`;
    if (preserveWhitespace) {
      throw new Error(error);
    }
    return reconstructXmlAsFallback(rawParsed, error);
  }

  try {
    let result = '';

    for (const node of rawParsed) {
      if (typeof node === 'object') {
        result += extractTextFromSingleNode(node);
      }
    }

    if (preserveWhitespace) {
      return result;
    } else {
      return { type: 'text', text: result.trim() + '\n' };
    }
  } catch (error) {
    const errorMessage = error.message || error.toString();
    if (preserveWhitespace) {
      throw new Error(errorMessage);
    }
    return reconstructXmlAsFallback(rawParsed, errorMessage);
  }
}


// Simple decorator which assumes the parser just wants to look at the
// parsed XML kids, and not all the other context.
//
// All the other context (e.g. attributes, tag, etc.) are just passed
// through transparently.
//
// This seems to be a large number of parsers.
type ParserFn = (ctx: any) => any;
type StaticKidsFn = (entry: any) => any[];

type ChildParserReturn = {
  parser: (ctx: any) => Promise<any>;
  staticKids?: StaticKidsFn;
};
type ChildParserFactory = ((options?: Record<string, unknown>) => ChildParserReturn) & {
  staticKids?: StaticKidsFn;
};

interface ChildParserFn extends ParserFn {
  _isChildParser?: boolean;
  staticKids?: StaticKidsFn;
}

export function childParser(fn: ChildParserFn, nameOverride?: string) {
  fn._isChildParser = true;

  const factory = function childParserFactory(options = {}) {
    const wrapped = async function wrappedParser(ctx) {
      const { id, tag, attributes, provenance, rawParsed, storeEntry, metadata } = ctx;
      const tagParsed = rawParsed[tag];
      const kids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
      const entry = {
        id,
        tag,
        attributes,
        provenance,
        kids: await fn({ ...ctx, rawKids: kids, rawParsed: tagParsed, ...options }),
        ...(metadata || {})  // Spread metadata fields flat into entry
      };
      storeEntry(id, entry);
      return id;
    };

    Object.defineProperty(wrapped, 'name', {
      value: `childParser(${nameOverride || fn.name || 'anonymous_child_parser'})`
    });

    // This is a bit of a hack. I hate having kidParsers with fn.staticKids.
    // They probably should return { parser, staticKids }.
    const mixin: ChildParserReturn = { parser: wrapped };
    if (typeof factory.staticKids === 'function') {
      mixin.staticKids = factory.staticKids;
    }

    return mixin;
  } as ChildParserFactory;

  return factory;
}

// === Parsers ===

// No internal information - returns empty kids array (not null).
const ignoreFactory = childParser(() => []);
ignoreFactory.staticKids = () => [];
export const ignore = ignoreFactory;

// Ad-hoc reconstruction of the source XML.
//
// This is less than ideal, but fast-xml-parser can't give us source
// XML easily. This is a hack, since the transformation is destructive.
//
// This is also pretty untested. If it ends up more used, we'll make a
// more robust version.
export const xml = {
  parser: function xmlParser(ctx) {
    const { id, tag, attributes, provenance, rawParsed, storeEntry } = ctx;
    return [
      {
        type: 'xml', xml: builder.build(rawParsed),
        id, tag, attributes, provenance
      }
    ];
  },
  staticKids: () => []
};

// Assumes we have a list of OLX-style Blocks. E.g. for a learning sequence.
// Options:
//   allowHTML: true - include HTML tags and text as mixed content for rendering
//                     Returns: [{ type: 'block', id }, { type: 'html', tag, ... }, { type: 'text', text }, ...]
//   allowHTML: false (default) - only process block tags, filter out HTML/text
//                     Returns: [{ id }, { id }, ...]
function createBlocksParser(options: { allowHTML?: boolean } = {}) {
  const { allowHTML = false } = options;

  async function blocksParser({ rawKids, parseNode }) {
    const results: any[] = [];

    for (let index = 0; index < rawKids.length; index++) {
      const child = rawKids[index];

      if (child['#text'] !== undefined) {
        if (allowHTML) {
          const text = child['#text'];
          if (text.trim() !== '') {
            results.push({ type: 'text', text });
          }
        }
        continue;
      }

      if (child['#comment'] !== undefined) continue;

      const tag = Object.keys(child).find(k => !['#text', '#comment', ':@'].includes(k));
      if (!tag) continue;

      const isBlock = tag[0] === tag[0].toUpperCase();

      if (isBlock) {
        const result = await parseNode(child, rawKids, index);
        if (result?.id) {
          results.push(allowHTML ? { type: 'block', id: result.id } : result);
        }
      } else if (allowHTML) {
        const attributes = child[':@'] ?? {};
        const htmlKids = child[tag];
        const htmlKidsArray = Array.isArray(htmlKids) ? htmlKids : (htmlKids ? [htmlKids] : []);
        const childResults = await blocksParser({ rawKids: htmlKidsArray, parseNode });

        results.push({
          type: 'html',
          tag,
          attributes,
          id: attributes.id as OlxKey | undefined,
          kids: childResults
        });
      }
    }

    return results;
  }

  const factory = childParser(blocksParser, 'blocksParser');
  factory.staticKids = (entry) => {
    if (!Array.isArray(entry.kids)) return [];
    return entry.kids
      .filter(k => k && (k.id || (k.type === 'block' && k.id)))
      .map(k => k.id);
  };

  return factory;
}

// Default blocks parser (no HTML)
const blocksFactory = createBlocksParser();
blocksFactory.staticKids = (entry) =>
  (Array.isArray(entry.kids) ? entry.kids : []).filter(k => k && k.id).map(k => k.id);
export const blocks = Object.assign(blocksFactory, {
  // blocks.allowHTML() returns parser that includes HTML/text as mixed content
  allowHTML: () => createBlocksParser({ allowHTML: true })()
});

function extractString(extracted: ReturnType<typeof extractTextFromXmlNodes>): string {
  if (typeof extracted === 'string') {
    return extracted;
  } else if (typeof extracted === 'object' && extracted !== null && 'text' in extracted) {
    return extracted.text;
  } else {
    throw new Error(`extractTextFromXmlNodes returned unexpected type: ${typeof extracted}`);
  }
}

// Feed through the text / CDATA content between the opening and closing tag.
//
// There should be no nested XML.
//
// Supports `src` attribute for loading external text files.
//
// Usage:
//   ...parsers.text()              - default: trim whitespace
//   ...parsers.text.raw()          - no processing
//   ...parsers.text.stripIndent()  - strip common leading indentation (for Markdown)
//   ...parsers.text({ postprocess: fn })  - custom function
type TextPostprocess = 'trim' | 'raw' | 'stripIndent' | ((text: string) => string);

const textFactory = childParser(async function textParser({ rawParsed, attributes, provider, provenance, postprocess = 'trim' }: {
  rawParsed: any; attributes: any; provider: any; provenance: any;
  postprocess?: TextPostprocess;
}) {
  let textContent: string;

  if (attributes?.src) {
    const loaded = await loadExternalSource({ src: attributes.src, provider, provenance });
    textContent = loaded.text;
  } else {
    const extracted = extractTextFromXmlNodes(rawParsed, { preserveWhitespace: postprocess === 'stripIndent' || postprocess === 'raw' });
    textContent = extractString(extracted);
  }

  let content: string;
  if (postprocess === 'stripIndent') {
    const { stripIndent } = await import('@/lib/content/stripIndent');
    try {
      content = stripIndent(textContent);
    } catch (error) {
      console.error('stripIndent error for rawParsed:', JSON.stringify(rawParsed, null, 2));
      console.error('Extracted content type:', typeof textContent);
      console.error('Extracted content value:', textContent);
      throw new Error(`Failed to process Markdown content: ${error instanceof Error ? error.message : String(error)}. Check that Markdown blocks contain only text, not nested elements.`);
    }
  } else if (postprocess === 'trim' || postprocess === undefined) {
    content = textContent.trim() + '\n';
  } else if (typeof postprocess === 'function') {
    content = postprocess(textContent);
  } else if (postprocess === 'raw') {
    content = textContent;
  } else {
    // TypeScript exhaustiveness — should never reach here with valid TextPostprocess
    throw new Error(`Unknown postprocess option: ${postprocess}`);
  }

  return content;
});
textFactory.staticKids = () => [];
export const text = Object.assign(textFactory, {
  raw: () => textFactory({ postprocess: 'raw' }),
  stripIndent: () => textFactory({ postprocess: 'stripIndent' }),
});

// === PEG Support ===
//
// PEG is similar to context-free grammars, and is used to support simplified formats,
// along the lines of the Open edX markdown problem format.

/**
 * PEG-based parser adapter for content inside OLX blocks.
 *
 * @param {Object} peggyParser - compiled PEG parser
 * @param {Object} options - Parser options
 * @param {Function} options.preprocess - fn({ type: 'text', text }) => { content }
 * @param {Function} options.postprocess - fn(parsed) => any
 * @param {boolean} options.skipStoreEntry - Skip the default storeEntry call (for custom handling)
 */
export function peggyParser(
  peggyParser,
  options: {
    preprocess?: (x: { type: string; text: string;[key: string]: any }) => any;
    postprocess?: (parsed: any) => any;
    skipStoreEntry?: boolean;
  } = {}
) {
  const {
    preprocess = (x) => ({ text: x.text }),
    postprocess = ({ parsed }) => ({ type: 'parsed', parsed }),  // Default: wrap in standard structure, excluding functions
    skipStoreEntry = false
  } = options;
  async function parser({
    id,
    rawParsed,
    tag,
    attributes,
    provenance,
    provider,
    storeEntry,
    errors,
    metadata
  }) {
    const tagParsed = rawParsed[tag];
    const kids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];

    let extracted;
    let prov = provenance;
    if (attributes?.src) {
      const loaded = await loadExternalSource({ src: attributes.src, provider, provenance });
      extracted = { type: 'text', text: loaded.text };
      prov = loaded.provenance;
    } else {
      extracted = extractTextFromXmlNodes(kids);
    }

    const { text, ...rest } = preprocess(extracted);

    let entry;
    try {
      const parsed = peggyParser.parse(text);
      const processedKids = postprocess({
        type: 'parsed',
        parsed,
        ...rest,
        // Pass through context for advanced use cases
        storeEntry,
        id,
        tag,
        attributes
      });

      entry = {
        id,
        tag,
        attributes,
        provenance: prov,
        rawParsed,
        kids: processedKids,
        ...(metadata || {})  // Spread metadata fields flat into entry
      };
    } catch (parseError) {
      const errorObj: OLXLoadingError = {
        type: 'peg_error' as const,
        summary: `Dialogue parsing error in ${prov.join(' → ')}`,
        file: prov.join(' → '),
        message: parseError.message,
        location: {
          line: parseError.location?.start?.line,
          column: parseError.location?.start?.column,
          offset: parseError.location?.start?.offset
        },
        technical: {
          expected: parseError.expected,
          found: parseError.found,
          name: parseError.name,
          originalTag: tag,
          originalId: id,
          fullError: parseError
        }
      };

      entry = {
        id,
        tag: 'ErrorNode',
        attributes,
        provenance: prov,
        rawParsed,
        kids: errorObj,
        parseError: true,
        ...(metadata || {})  // Spread metadata even for error nodes
      };

      // Accumulate error in the errors array if available
      if (typeof errors !== 'undefined' && Array.isArray(errors)) {
        errors.push(errorObj);
      }
    }

    // Allow postprocess to handle storage for complex cases
    if (!skipStoreEntry) {
      storeEntry(id, entry);
    }
    return id;
  }

  return { parser, staticKids: () => [] };
}

// === Asset Source Parser ===
//
// Reusable parser for blocks that reference content files via `src`
// (Image, PDFViewer, Audio, Video, etc.). Resolves relative paths
// using the storage provider during parsing.
//
// TODO: Figure out how to do this right. I'm deeply not convinced
// by this as a parser.
//
// We need some kind of helper, but this breaks for e.g. multiple
// video sources, any place where we have src= as well as structured
// content, etc. We should be able to simply map a path to a URL.
//
// HACK HACK HACK

/**
 * Creates a parser that resolves the `src` attribute against the
 * storage provider. No children.
 *
 * Usage:
 *   import * as parsers from '@/lib/content/parsers';
 *   const Image = core({ ...parsers.assetSrc(), ... });
 */
const assetSrcFactory = function assetSrc() {
  function assetSrcParser({ id, tag, attributes, provenance, storeEntry, provider }) {
    const { src, ...otherAttributes } = attributes;

    let resolvedSrc = src;
    let updatedProvenance = provenance;

    // Resolve relative paths and track the asset as a dependency
    if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//') && !src.startsWith('/')) {
      if (provenance && provenance.length > 0 && provider?.resolveRelativePath) {
        if (provenance.length !== 1) {
          throw new Error(`assetSrc parser expects exactly one provenance entry (the OLX file), got ${provenance.length}: ${JSON.stringify(provenance)}`);
        }
        const olxProvenance = provenance[0];
        resolvedSrc = provider.resolveRelativePath(olxProvenance, src);

        // Add asset to provenance for dependency tracking (like peg/md parsers do).
        // Let the provider construct the URI — it knows its own scheme.
        if (provider.toProvenanceURI) {
          updatedProvenance = [...provenance, provider.toProvenanceURI(resolvedSrc)];
        }
      }
    }

    storeEntry(id, { id, tag, attributes: { ...otherAttributes, src: resolvedSrc }, provenance: updatedProvenance, kids: [] });
    return id;
  }

  return { parser: assetSrcParser, staticKids: () => [] };
};
export const assetSrc = assetSrcFactory;
