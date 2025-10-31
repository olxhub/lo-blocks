// src/lib/content/parsers.ts
//
// OLX content parsers - composable utilities for processing Learning Observer XML content.
//
// Provides a parser combinator library for transforming OLX (Open Learning XML) into
// the internal block representation. Key parsers include:
//
// - `childParser()`: Decorator that allows for simple parser functions handling the 95% use-case of just transforming children
// - `blocks`: A childParser that processes lists of block elements (filters out text/comments)
// - `text`: Extracts plain text content with whitespace handling
// - `peggyParser()`: Integrates PEG grammars for domain-specific formats
// - `xml`/`xmljson`: Raw XML passthrough for complex content
//
// Preserves provenance (file/line info) for debugging and authoring.
//
// This enables Learning Observer to support a range of teacher-friendly ways of structuring content.
//
import { XMLBuilder } from 'fast-xml-parser';
import path from 'path';
import type { OLXLoadingError } from '@/lib/types';

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
      const { id, tag, attributes, provenance, rawParsed, storeEntry } = ctx;
      const tagParsed = rawParsed[tag];
      const kids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
      const entry = {
        id,
        tag,
        attributes,
        provenance,
        rawParsed,
        kids: await fn({ ...ctx, rawKids: kids, rawParsed: tagParsed, ...options })
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

// No internal information.
const ignoreFactory = childParser(() => null);
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
        id, tag, attributes, provenance, rawParsed
      }
    ];
  },
  staticKids: () => []
};

// Assumes we have a list of OLX-style Blocks. E.g. for a learning sequence.
const blocksFactory = childParser(async function blocksParser({ rawKids, parseNode }) {
  let promises = rawKids
    .filter(child => {
      const tag = Object.keys(child).find(k => !['#text', '#comment', ':@'].includes(k));
      return !!tag;
    })
    .map(parseNode);
  let awaited = await Promise.all(promises);
  return awaited.filter(entry => entry.id);
});
blocksFactory.staticKids = (entry) =>
  (Array.isArray(entry.kids) ? entry.kids : []).filter(k => k && k.id).map(k => k.id);
export const blocks = blocksFactory;

// Pass through the parsed XML, in the fast-xml-parser format
const xmljsonFactory = childParser(({ rawParsed }) => [
  { type: 'node', rawParsed }
]);
xmljsonFactory.staticKids = () => [];
export const xmljson = xmljsonFactory;

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
const textFactory = childParser(async function textParser({ rawParsed, postprocess = 'trim' }) {
  let content: string;

  if (postprocess === 'stripIndent') {
    const extracted = extractTextFromXmlNodes(rawParsed, { preserveWhitespace: true });
    const textContent = extractString(extracted);

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
    content = extractString(extractTextFromXmlNodes(rawParsed));
  } else if (typeof postprocess === 'function') {
    const extracted = extractTextFromXmlNodes(rawParsed, { preserveWhitespace: true });
    content = postprocess(extractString(extracted));
  } else if (postprocess === 'none') {
    content = extractString(extractTextFromXmlNodes(rawParsed, { preserveWhitespace: true }));
  } else {
    throw new Error(`Unknown postprocess option: ${postprocess}`);
  }

  return content;
});
textFactory.staticKids = () => [];
export const text = textFactory;

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
    preprocess?: (x: { type: string; text: string; [key: string]: any }) => any;
    postprocess?: (parsed: any) => any;
    skipStoreEntry?: boolean;
  } = {}
) {
  const {
    preprocess = (x) => ({ text: x.text }),
    postprocess = (x) => x,
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
    errors
  }) {
    const tagParsed = rawParsed[tag];
    const kids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];

    let extracted;
    let prov = provenance;
    if (attributes?.src) {
      if (!provider) {
        throw new Error('peggyParser: no storage provider supplied for src');
      }
      const lastProv = provenance[provenance.length - 1];
      let resolved = attributes.src;
      if (lastProv && lastProv.startsWith('file://')) {
        // HACK: Only handles file:// provenances. Non-file providers may break.
        // TODO: Resolve src correctly for other storage providers.
        const baseDir = path.dirname(lastProv.slice('file://'.length));
        resolved = path.join(baseDir, attributes.src);
        prov = [...provenance, `file://${resolved}`];
      } else {
        prov = [...provenance, resolved];
      }
      const content = await provider.read(resolved);
      extracted = { type: 'text', text: content };
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
        kids: processedKids
      };
    } catch (parseError) {
      const errorObj: OLXLoadingError = {
        type: 'peg_error' as const,
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
        parseError: true
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
