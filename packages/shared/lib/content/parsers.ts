// src/lib/content/parsers.ts
//
// OLX content parsers - composable utilities for processing Learning Observer XML content.
//
// Provides a parser combinator library for transforming OLX (Open Learning XML) into
// the internal block representation. Key parsers include:
//
// - `childParser()`: Decorator for simple parser functions (handles the 95% case of just transforming children)
// - `blocks`: Processes lists of block elements (filters out text/comments)
// - `blocks.wrapText(tag)`: Same as blocks but auto-wraps bare text in the given block (e.g. Markdown)
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
import { z } from 'zod';
import yaml from 'js-yaml';
import { XMLBuilder } from 'fast-xml-parser';
import type { OLXLoadingError, DefinitionRef, DefinitionKey, RuntimeProps, StateKey, LofsDependencies } from '@/lib/types';
import { toLofsCanonical, withVersion, toLofsVersion } from '@/lib/types/address';
import { isContentFile, CATEGORY, extensionsWithDots } from '@/lib/util/fileTypes';
import { z_stateRef } from '@/lib/blocks/attributeSchemas';
import * as state from '@/lib/state';

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
  // SafeRelativePath — same idea as DefinitionRef → DefinitionKey for block IDs.
  const resolved = provider.resolveRelativePath(lastProv, src);

  // Read first, then use the canonical provenance from the read result.
  // ReadResult.provenance is LofsCanonical — it records what was actually read.
  const readResult = await provider.read(resolved);
  const newProvenance: LofsDependencies = [...provenance, readResult.provenance];
  return { text: readResult.content, provenance: newProvenance };
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

/**
 * What kind of children this parser accepts.
 * Used by CodeMirror XML schema to determine autocompletion behavior:
 *   'blocks' — child elements are OLX blocks (suggests block names)
 *   'text'   — text content only (no child element suggestions)
 *   'none'   — self-closing / no children
 *   undefined — custom parser (permissive: suggests all block names)
 */
export type ChildMode = 'blocks' | 'text' | 'none';

type ChildParserReturn = {
  parser: (ctx: any) => Promise<any>;
  staticKids?: StaticKidsFn;
  childMode?: ChildMode;
};
type ChildParserFactory = ((options?: Record<string, unknown>) => ChildParserReturn) & {
  staticKids?: StaticKidsFn;
  childMode?: ChildMode;
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
    if (factory.childMode) {
      mixin.childMode = factory.childMode;
    }

    return mixin;
  } as ChildParserFactory;

  return factory;
}

// === Parsers ===

// No internal information - returns empty kids array (not null).
const ignoreFactory = childParser(() => []);
ignoreFactory.staticKids = () => [];
ignoreFactory.childMode = 'none';
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
  staticKids: () => [],
  childMode: 'text' as ChildMode,
};

// Assumes we have a list of OLX-style Blocks. E.g. for a learning sequence.
// Options (on createBlocksParser):
//   text: 'error' (default)    - throw on non-whitespace text or HTML tags
//   text: 'passthrough'        - include HTML tags and text as mixed content (legacy allowHTML)
//                                 Returns: [{ type: 'block', id }, { type: 'html', tag, ... }, { type: 'text', text }, ...]
//   text: 'wrap', wrapTag: tag - auto-wrap bare text segments in the given block (e.g. 'Markdown')
//                                 Returns: [{ id }, { id }, ...] (text wrapped in synthetic blocks)
// Options (on factory call, e.g. blocks({ requiredChildren: 2 })):
//   requiredChildren: N - enforce exactly N block children at parse time.
//                     Children cannot use when= (filtering would break the
//                     fixed structure). E.g. SplitPanel requires exactly 2.
// Text handling modes for blocks parser:
//   'error'       — throw on non-whitespace text (default; prevents silent data loss)
//   'passthrough' — include text/HTML as mixed content (legacy allowHTML behavior)
//   'wrap'        — auto-wrap text segments in a block tag (requires wrapTag)
type BlocksTextMode = 'error' | 'passthrough' | 'wrap';

function createBlocksParser(options: { text?: BlocksTextMode; wrapTag?: string } = {}) {
  const { text: textMode = 'error', wrapTag = null } = options;
  const allowHTML = textMode === 'passthrough';

  async function blocksParser({ rawKids, parseNode, tag: parentTag = undefined, requiredChildren = undefined }) {
    const results: any[] = [];

    for (let index = 0; index < rawKids.length; index++) {
      const child = rawKids[index];

      if (child['#text'] !== undefined) {
        const text = child['#text'];
        if (text.trim() !== '') {
          if (allowHTML) {
            results.push({ type: 'text', text });
          } else if (textMode === 'wrap' && wrapTag) {
            // Auto-wrap text in a synthetic block (e.g. Markdown)
            const syntheticNode = { [wrapTag]: [{ '#text': text }] };
            const result = await parseNode(syntheticNode, null, -1);
            if (result?.id) {
              results.push(result);
            }
          } else {
            const preview = text.trim().slice(0, 40);
            const context = parentTag ? ` inside <${parentTag}>` : '';
            throw new Error(
              `Unexpected text "${preview}"${context} — ` +
              `expected OLX block tags (e.g. <Markdown>). ` +
              `Wrap text content in a block element.`
            );
          }
        }
        continue;
      }

      if (child['#comment'] !== undefined) continue;

      const tag = Object.keys(child).find(k => !['#text', '#comment', ':@'].includes(k));
      if (!tag) continue;

      const isBlock = tag[0] === tag[0].toUpperCase();

      if (isBlock) {
        // when= is incompatible with requiredChildren — filtering would
        // break the fixed child structure the parent depends on.
        if (requiredChildren && child[':@']?.when) {
          throw new Error(
            `<${tag}> inside <${parentTag}> cannot use when= ` +
            `(${parentTag} requires exactly ${requiredChildren} children)`
          );
        }

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
          id: attributes.id as DefinitionKey | undefined,
          kids: childResults
        });
      } else {
        // Lowercase tag in blocks-only mode — HTML is not allowed here
        const context = parentTag ? ` inside <${parentTag}>` : '';
        throw new Error(
          `Unexpected HTML tag <${tag}>${context} — ` +
          `expected OLX block tags (uppercase, e.g. <Markdown>). ` +
          `Use parsers.blocks.allowHTML() to allow HTML content.`
        );
      }
    }

    if (requiredChildren && results.length !== requiredChildren) {
      throw new Error(
        `<${parentTag}> requires exactly ${requiredChildren} block children, got ${results.length}`
      );
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
  factory.childMode = 'blocks';

  return factory;
}

// Default blocks parser (no HTML)
const blocksFactory = createBlocksParser();
blocksFactory.staticKids = (entry) =>
  (Array.isArray(entry.kids) ? entry.kids : []).filter(k => k && k.id).map(k => k.id);
export const blocks = Object.assign(blocksFactory, {
  // blocks.allowHTML() returns parser that includes HTML/text as mixed content
  allowHTML: () => createBlocksParser({ text: 'passthrough' })(),
  // blocks.wrapText('Markdown') auto-wraps bare text segments in the given block tag
  wrapText: (tag: string) => createBlocksParser({ text: 'wrap', wrapTag: tag })(),
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
textFactory.childMode = 'text';

// === withTarget variant ===
//
// `parsers.text.withTarget()` (and its `.raw` / `.stripIndent` siblings)
// bundle the same text parser together with a `parserMixin` that turns
// the block into a coherent text-source consumer. This lets display
// blocks like Mermaid, Markdown, ObservablePlot, etc. accept their
// source text from any of four places:
//
//   1. child text                 <Mermaid>graph TD; A --> B</Mermaid>
//   2. src= (parse-time load)     <Mermaid src="diagram.mmd"/>
//   3. target= (reactive read)    <Mermaid target="codeEditor"/>
//   4. own value field (settable) <Set target="myMermaid" value="..."/>
//
// All four routes converge on the same `selectValue` below, which reads
// `commonFields.value` from Redux and falls back to the block's parsed
// `kids` (which was populated at parse time from either `src=` or the
// block's child text). The render-time hook is `useTextContent`.
//
// - With no `target=`, `useValue` defaults to "this block", so the read
//   goes through *this* block's selectValue → Redux value → kids.
// - With `target="other"`, the read goes through the *target* block's
//   selectValue. If the target also uses this mixin (or any block with a
//   compatible value field — TextArea, etc.), it just works.
//
// `target=` is tagged via `z_stateRef`, so `getRefAttributes` /
// `ensureReferencedBlocks` automatically preload the referenced block.
//
// `requiresUniqueId: false` is baked in because text-display blocks
// typically don't need unique IDs — they render content, not state.
// Blueprint-level `requiresUniqueId: true` still wins via the factory's
// later-layer-overrides rule for scalar keys.
const textWithTargetParserMixin = {
  attributes: z.object({
    src: z.string().optional().describe('Path to external file containing content'),
    target: z_stateRef.optional().describe(
      'Read content from another block\'s value field (reactive)'
    ),
  }).strict(),
  fields: state.fields([state.commonFields.value]),
  // Read commonFields.value, falling back to the block's parsed text
  // (kids). The fallback is what makes the static
  //   <Mermaid>graph TD; A --> B</Mermaid>
  // form render before anyone has written to the value field, and what
  // makes a `<Ref target="myMermaid">` see the diagram's current text.
  //
  // TODO: This selectValue is a stopgap living at the *value* field
  // only. It lets `<Ref>` and any other `valueSelector` consumer read
  // a sensible "current displayed value" off this block — Redux value
  // when set, kids when not. But sibling actions like CopyFieldAction,
  // SetFieldAction, LLMAction read fields via raw `getField` and so
  // bypass selectValue entirely. They see "" for an unset value field
  // even when the rendered block clearly shows kids text. (See
  // MermaidPublish.olx — click Publish before editing and watch the
  // published diagram clear.)
  //
  // The right fix is a general per-field "current displayed value"
  // protocol — selectValue generalized from value-only to arbitrary
  // fields, or a `field.display` hook that every consumer (refs,
  // copies, LLM context, …) consults. Once that lands, this one-off
  // selectValue goes away and every consumer sees the same
  // semantically-meaningful value the renderer sees.
  selectValue: (props: RuntimeProps, reduxState: any, id: StateKey) => {
    const kids = typeof props.kids === 'string' ? props.kids : '';
    return state.fieldSelector(
      reduxState,
      props,
      state.commonFields.value,
      { fallback: kids, stateKey: id }
    );
  },
  requiresUniqueId: false,
};

export const text = Object.assign(textFactory, {
  raw: () => textFactory({ postprocess: 'raw' }),
  stripIndent: () => textFactory({ postprocess: 'stripIndent' }),
  withTarget: Object.assign(
    () => ({ ...textFactory(), parserMixin: textWithTargetParserMixin }),
    {
      raw: () => ({ ...textFactory({ postprocess: 'raw' }), parserMixin: textWithTargetParserMixin }),
      stripIndent: () => ({ ...textFactory({ postprocess: 'stripIndent' }), parserMixin: textWithTargetParserMixin }),
    }
  ),
});

// Text content → attribute parser.
//
// Moves text content into a named attribute instead of kids. Useful for blocks
// like Ref where <Ref>targetId</Ref> should compile to {target: 'targetId'}.
//
// If both the attribute and non-empty text content are present, throws a parse error.
// Whitespace-only text content is ignored (not a conflict).
//
// Usage:
//   ...parsers.textToAttribute('target')
//
export function textToAttribute(attrName: string) {
  async function textToAttributeParser(ctx) {
    const { id, tag, attributes, provenance, rawParsed, storeEntry, metadata, provider } = ctx;
    const tagParsed = rawParsed[tag];

    // Extract text content (same mechanism as text parser)
    let textContent: string;
    if (attributes?.src) {
      const loaded = await loadExternalSource({ src: attributes.src, provider, provenance });
      textContent = loaded.text.trim();
    } else {
      const extracted = extractTextFromXmlNodes(tagParsed, { preserveWhitespace: false });
      textContent = extractString(extracted).trim();
    }

    // Conflict: both attribute and non-empty text content
    if (attributes?.[attrName] && textContent) {
      throw new Error(
        `<${tag}>: Both ${attrName}="${attributes[attrName]}" attribute and ` +
        `text content "${textContent}" specified. Use one or the other.`
      );
    }

    // Text content becomes the named attribute (if not already set)
    const finalAttributes = { ...attributes };
    if (!finalAttributes[attrName] && textContent) {
      finalAttributes[attrName] = textContent;
    }

    const entry = {
      id,
      tag,
      attributes: finalAttributes,
      provenance,
      kids: [],
      ...(metadata || {})
    };
    storeEntry(id, entry);
    return id;
  }

  return { parser: textToAttributeParser, staticKids: () => [], childMode: 'none' as ChildMode };
}

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
    postprocess?: (parsed: any) => any | Promise<any>;
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
    parseNode,
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
      const processedKids = await postprocess({
        type: 'parsed',
        parsed,
        ...rest,
        // Pass through context for advanced use cases
        storeEntry,
        parseNode,
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
        title: `Dialogue parsing error in ${prov.join(' → ')}`,
        message: parseError.message,
        location: {
          provenance: prov,
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
        attributes: errorObj,
        provenance: prov,
        rawParsed,
        kids: [],
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

  // Auto-detect grammar from compiled parser metadata (set by compile-grammars)
  const grammarExt = peggyParser._grammarExtension;
  return {
    parser,
    staticKids: () => [],
    ...(grammarExt && { grammars: [grammarExt] }),
  };
}

// === YAML + Zod Support ===
//
// For blocks with simple structured content (key-value config), YAML is a
// natural fit. Combined with a Zod schema for validation and transforms,
// this replaces PEG grammars for formats that are essentially "a few fields
// with lists." The Zod schema can do things like split comma-separated
// strings into arrays (idempotently — already-arrays pass through), parse
// suffixes, and provide clear validation errors.
//
// See TabularMCQ for the canonical example.

/**
 * YAML+Zod parser adapter for content inside OLX blocks.
 *
 * Extracts text content from the block, parses it as YAML, then validates
 * and transforms the result through a Zod schema. The output is stored
 * in the standard `{ type: 'parsed', parsed }` kids structure.
 *
 * @param schema - Zod schema to validate/transform the parsed YAML
 */
export function yamlParser(schema: z.ZodType) {
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

    let prov = provenance;
    let textContent: string;
    if (attributes?.src) {
      const loaded = await loadExternalSource({ src: attributes.src, provider, provenance });
      textContent = loaded.text;
      prov = loaded.provenance;
    } else {
      const extracted = extractTextFromXmlNodes(kids, { preserveWhitespace: true });
      textContent = typeof extracted === 'string' ? extracted : extracted.text;
    }

    let entry;
    try {
      const raw = yaml.load(textContent, { schema: yaml.JSON_SCHEMA });
      const parsed = schema.parse(raw);

      entry = {
        id,
        tag,
        attributes,
        provenance: prov,
        rawParsed,
        kids: { type: 'parsed', parsed },
        ...(metadata || {})
      };
    } catch (parseError) {
      // Zod errors have a nice .issues array; YAML errors have .mark with line/column
      const isZod = parseError?.issues !== undefined;
      const message = isZod
        ? parseError.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
        : (parseError.message || String(parseError));

      const errorObj: OLXLoadingError = {
        type: 'parse_error' as const,
        title: `YAML parse error in ${prov.join(' → ')}`,
        message,
        location: {
          provenance: prov,
          line: parseError.mark?.line != null ? parseError.mark.line + 1 : undefined,
          column: parseError.mark?.column != null ? parseError.mark.column + 1 : undefined,
        },
        technical: {
          name: parseError.name,
          originalTag: tag,
          originalId: id,
          ...(isZod ? { zodIssues: parseError.issues } : {}),
          fullError: parseError
        }
      };

      entry = {
        id,
        tag: 'ErrorNode',
        attributes: errorObj,
        provenance: prov,
        rawParsed,
        kids: [],
        parseError: true,
        ...(metadata || {})
      };

      if (typeof errors !== 'undefined' && Array.isArray(errors)) {
        errors.push(errorObj);
      }
    }

    storeEntry(id, entry);
    return id;
  }

  return { parser, staticKids: () => [], childMode: 'text' as ChildMode };
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

        // HACK: This ref has no real version because the parser is synchronous
        // and can't call provider.read(). We use a placeholder version so it's
        // structurally valid as LofsCanonical. Making the parser async would
        // let us get real canonical provenance (mtime, content hash) here.
        if (provider.toLofsRef) {
          const assetRef = withVersion(provider.toLofsRef(resolvedSrc), toLofsVersion('unresolved'));
          updatedProvenance = [...provenance, toLofsCanonical(assetRef)];
        }
      }
    }

    storeEntry(id, { id, tag, attributes: { ...otherAttributes, src: resolvedSrc }, provenance: updatedProvenance, kids: [] });
    return id;
  }

  return { parser: assetSrcParser, staticKids: () => [], childMode: 'none' as ChildMode };
};
export const assetSrc = assetSrcFactory;
