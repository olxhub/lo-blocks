// src/lib/olx/parsers.js
import { XMLBuilder } from 'fast-xml-parser';

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
const prod=false;

// === Utilities ===

/**
 * Extracts and compacts all text content from a parsed XML node array.
 *
 * Accepts an array of parsed XML nodes (as returned by fast-xml-parser),
 * combining all `#text` and `cdata` content into a single string.
 *
 * - If any node contains unexpected keys (i.e., not `#text` or `cdata`), the function fails.
 * - If `prod` is true, it returns a fallback object on failure instead of throwing.
 * - Whitespace is preserved internally; leading/trailing whitespace is trimmed, and a newline is added at the end.
 *
 * @param {Array<Object>} rawParsed - An array of parsed XML content nodes.
 * @returns {Object} - `{ text: string, type: 'text' }`, or fallback object on failure.
 */
function extractInnerTextFromXmlNodes(rawParsed) {
  const fail = (err) => {
    console.warn('⚠️', err);
    if (typeof prod !== 'undefined' && prod) {
      const poorlyReconstructedText = builder.build({ fakeRoot: rawParsed })
            .split('<fakeRoot>').join('')
            .split('</fakeRoot>').join('')
            .trim()+'\n';
      return {
        warning: err,
        type: 'text',
        text: poorlyReconstructedText
      };
    }
    throw new Error(err);
  };

  if (!Array.isArray(rawParsed)) {
    return fail(`Expected rawParsed to be an array`);
  }

  try {
    let result = '';

    for (const node of rawParsed) {
      if (typeof node === 'object') {
        if ('#text' in node && typeof node['#text'] === 'string') {
          result += node['#text'];
        } else if ('cdata' in node && Array.isArray(node.cdata)) {
          for (const c of node.cdata) {
            if (typeof c === 'object' && '#text' in c) {
              result += c['#text'];
            } else {
              return fail(`Malformed CDATA structure: ${JSON.stringify(node)}`);
            }
          }
        } else if (Object.keys(node).length > 0) {
          return fail(`XML found in text data: ${JSON.stringify(node)}`);
        }
      }
    }

    return {type: 'text', text: result.trim() + '\n'};
  } catch (error) {
    return fail(error.message || error.toString());
  }
}

// Simple decorator which assumes the parser just wants to look at the
// parsed XML children, and not all the other context.
//
// All the other context (e.g. attributes, tag, etc.) are just passed
// through transparently.
//
// This seems to be a large number of parsers.
export function childParser(fn, nameOverride) {
  fn._isChildParser = true;

  const wrapped = function wrappedParser(ctx) {
    const { id, tag, attributes, provenance, rawParsed, storeEntry } = ctx;
    const tagParsed=rawParsed[tag];
    const children = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
    const entry = {
      id,
      tag,
      attributes,
      provenance,
      rawParsed,
      children: fn({ ...ctx, rawChildren: children, rawParsed: tagParsed })
    };
    storeEntry(id, entry);
    return id;
  };

  Object.defineProperty(wrapped, 'name', {
    value: `childParser(${nameOverride || fn.name || 'anonymous_child_parser'})`
  });

  return { parser: wrapped };
}

// === Parsers ===

// No internal information.
export const ignore = childParser(() => null);

// Ad-hoc reconstruction of the source XML.
//
// This is less than ideal, but fast-xml-parser can't give us source
// XML easily. This is a hack, since the transformation is destructive.
//
// This is also pretty untested. If it ends up more used, we'll make a
// more robust version.
export const xml = {
  parser: function xmlParser({ rawParsed }) {
    return [
      { type: 'xml', xml: builder.build(rawParsed) }
    ];
  }
};

// Assumes we have a list of OLX-style XBlocks. E.g. for a learning sequence.
export const xblocks = childParser(function xblocksParser({ rawChildren, parseNode }) {
  return rawChildren
    .filter(child => {
      const tag = Object.keys(child).find(k => !['#text', '#comment', ':@'].includes(k));
      return !!tag;
    })
    .map(parseNode)
    .filter(entry => entry.id);
});

// Pass through the parsed XML, in the fast-xml-parser format
export const xmljson = childParser(({ rawParsed }) => [
  { type: 'node', rawParsed }
]);

// Feed through the text / CDATA content between the opening and closing tag.
//
// There should be no nested XML.
export const text = childParser(function textParser({ rawParsed }) {
  return extractInnerTextFromXmlNodes(rawParsed).text;
});

// === PEG Support ===
//
// PEG is similar to context-free grammars, and is used to support simplified formats,
// along the lines of the Open edX markdown problem format.

/**
 * PEG-based parser adapter for content inside OLX blocks.
 *
 * @param {Object} peggyParser - compiled PEG parser
 * @param {Function} preprocess - fn({ type: 'text', text }) => { content }
 * @param {Function} postprocess - fn(parsed) => any
 */
export function peggyParser(peggyParser, preprocess = (x) => ({ text: x.text }), postprocess = (x) => x) {
  const { parser } = childParser(function peggyChildParser({ rawParsed }) {
    const extracted = extractInnerTextFromXmlNodes(rawParsed);
    const { text, ...rest } = preprocess(extracted);

    let parsed;
    try {
      parsed = peggyParser.parse(text);
    } catch (err) {
      console.error('[peggyParser] Parse error:', err);
      throw err;
    }

    return postprocess({ type: 'parsed', parsed, ...rest });
  });

  return { parser };
}
