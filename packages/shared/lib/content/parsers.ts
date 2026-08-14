// packages/shared/lib/content/parsers.ts
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
// Preserves source/parseDeps (file/line info) for debugging and authoring.
//
// Future: An `xmljson` parser could pass through raw fast-xml-parser JSON for blocks
// that need to do their own XML processing. Not currently implemented.
//
import { z } from 'zod';
import yaml from 'js-yaml';
import { XMLBuilder } from 'fast-xml-parser';
import type {
  BlockReference, ContentNamespace, DefinitionKey, DefinitionRef, OLXLoadingError, RuntimeProps, StateKey,
} from '@/lib/types';
import { qualifyDefinitionRef } from '@/lib/types/id-grammar';
import type { LofsCanonical } from '@/lib/types/address';
import { toLofsCanonical, withVersion, toLofsVersion } from '@/lib/types/address';
import { isContentFile, CATEGORY, extensionsWithDots } from '@/lib/util/fileTypes';
import { templateAttribute, z_stateRef } from '@/lib/blocks/attributeSchemas';
import type { TextTemplateMode } from '@/lib/blocks/attributeSchemas';
import * as state from '@/lib/state';
import { elementKids, elementTag } from './xmlParser';
import type { RawXmlAttributes, RawXmlNode } from './xmlParser';

// === Setup ===

/** Raw HTML does not establish an OLX content-variant language boundary. */
export function rejectHtmlLang(tag: string, attributes: RawXmlAttributes): void {
  if (attributes.lang !== undefined) {
    throw new Error(
      `lang= on raw HTML <${tag}> is not yet supported; its semantics relative to OLX language variants are undefined`
    );
  }
}

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
 * Load an external file referenced by a src= attribute.
 *
 * Resolves `src` relative to the most recent file in the dependency chain
 * (the last parseDep, or the source file if no deps yet). Returns the
 * loaded text and the canonical ref of the loaded file (to append to
 * parseDeps).
 */
export async function loadExternalSource({
  src,
  provider,
  source,
  parseDeps,
}: {
  src: string;
  provider: any;
  source: LofsCanonical;
  parseDeps: LofsCanonical[];
}): Promise<{ text: string; dep: LofsCanonical }> {
  if (!provider) {
    throw new Error('No storage provider supplied for src attribute');
  }

  if (!isContentFile(src)) {
    const allowed = extensionsWithDots(CATEGORY.content).join(', ');
    throw new Error(`Invalid src file type: "${src}". Allowed extensions: ${allowed}`);
  }

  // Resolve relative to the most recent file in the chain
  const resolveBase = parseDeps.length > 0 ? parseDeps[parseDeps.length - 1] : source;
  const resolved = provider.resolveRelativePath(resolveBase, src);

  const readResult = await provider.read(resolved);
  return { text: readResult.content, dep: readResult.provenance };
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
export function extractTextFromXmlNodes(rawParsed, { preserveWhitespace = false } = {}) {
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
      const { id, tag, attributes, source, parseDeps: parseDepsIn, rawParsed, storeEntry, metadata } = ctx;
      const tagParsed = rawParsed[tag];
      const kids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
      // Mutable accumulator so inner parsers (textParser etc.) can record
      // deps from loadExternalSource. Passed to fn via ctx override.
      const deps = [...parseDepsIn];
      const fnKids = await fn({ ...ctx, parseDeps: deps, rawKids: kids, rawParsed: tagParsed, ...options });
      const entry = {
        id,
        tag,
        attributes,
        source,
        parseDeps: deps,
        kids: fnKids,
        ...(metadata || {})
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
    const { id, tag, attributes, source, parseDeps, rawParsed, storeEntry } = ctx;
    return [
      {
        type: 'xml', xml: builder.build(rawParsed),
        id, tag, attributes, source, parseDeps
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
//                                 Returns: [{ type: 'block', definitionKey }, { type: 'html', tag, ... }, { type: 'text', text }, ...]
//   text: 'wrap', wrapTag: tag - auto-wrap bare text segments in the given block (e.g. 'Markdown')
//                                 Returns: [{ definitionKey }, { definitionKey }, ...] (text wrapped in synthetic blocks)
// Options (on factory call, e.g. blocks({ requiredChildren: 2 })):
//   requiredChildren: N - enforce exactly N block children at parse time.
//                     Children cannot use when= (filtering would break the
//                     fixed structure). E.g. SplitPanel requires exactly 2.
// ─── staticKids id collection ────────────────────────────────────────────────
//
// A block's `staticKids(entry)` tells collectBlockWithKids (the content-serving
// path) which child block ids to ship to the client. Blocks whose parsed `kids`
// is a flat array of child entries all need the same logic — return the ids of
// the entries that carry one — so it lives here next to the parser factories
// that default it. Forgetting it (or getting it wrong) is exactly what makes a
// generated child fail to serve and render as "Block <id> not found in
// content"; reuse these instead of re-deriving.

/** Build a canonical block reference from a generated or authored definition ref. */
export function blockReference(
  definitionRef: DefinitionRef,
  ns: ContentNamespace,
  extras: Omit<BlockReference, 'type' | 'definitionKey'> = {},
): BlockReference {
  return {
    type: 'block',
    definitionKey: qualifyDefinitionRef(definitionRef, ns),
    ...extras,
  };
}

/**
 * Definition keys of direct block kids, in order.
 *
 * Text/HTML/CDATA kids (no block definition key) are skipped. Operates on any flat array of
 * parsed kid entries, so blocks whose kids are grouped under named slots can
 * spread the slots together first (see SideBarPanel/SplitPanel/Course).
 */
export function kidIds(kids: readonly unknown[]): DefinitionKey[] {
  return kids.flatMap((k) => {
    const kid = k as { type?: unknown; definitionKey?: unknown } | null | undefined;
    return kid?.type === 'block' && typeof kid.definitionKey === 'string'
      ? [kid.definitionKey as DefinitionKey]
      : [];
  });
}

/**
 * The canonical `staticKids` for blocks whose parsed `kids` is a flat array of
 * child entries — the shape the blocks parser produces and the shape generator
 * blocks build when they `storeEntry` their children. Returns the direct child
 * ids; collectBlockWithKids recurses into each to gather the rest of the subtree.
 */
export function directKidIds(entry: { kids?: unknown }): DefinitionKey[] {
  return kidIds(Array.isArray(entry?.kids) ? entry.kids : []);
}

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
            if (result?.definitionKey) {
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

      const tag = elementTag(child as RawXmlNode);
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
        if (result?.definitionKey) {
          // Keep the complete reference: a <Use> carries its stateKey and
          // overrides, which mixed-content parsing must not discard.
          results.push(result);
        }
      } else if (allowHTML) {
        const attributes = child[':@'] ?? {};
        rejectHtmlLang(tag, attributes);
        const htmlKidsArray = elementKids(child as RawXmlNode, tag);
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
  factory.staticKids = directKidIds;
  factory.childMode = 'blocks';

  return factory;
}

// Default blocks parser (no HTML)
const blocksFactory = createBlocksParser();
blocksFactory.staticKids = directKidIds;
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
type TextOptions = {
  postprocess?: TextPostprocess;
};

const textFactory = childParser(async function textParser({ rawParsed, attributes, provider, source, parseDeps, postprocess = 'trim' }: {
  rawParsed: any; attributes: any; provider: any; source: LofsCanonical; parseDeps: LofsCanonical[];
  postprocess?: TextPostprocess;
}) {
  let textContent: string;

  if (attributes?.src) {
    const loaded = await loadExternalSource({ src: attributes.src, provider, source, parseDeps });
    textContent = loaded.text;
    parseDeps.push(loaded.dep);
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

// Adds `target=` and a writable value field to a text block. Inline/src text
// remains the fallback. Usage: `...parsers.text.withTarget.stripIndent()`.
const targetableTextMixin = {
  attributes: z.object({
    src: z.string().optional().describe('Path to external file containing content'),
    target: z_stateRef.optional().describe(
      'Read content from another block\'s value field (reactive)'
    ),
  }).strict(),
  fields: state.fields([state.commonFields.value]),
  selectors: {
    value: (reduxState: any, props: RuntimeProps, id: StateKey) => {
      const kids = typeof props.kids === 'string' ? props.kids : '';
      return state.decodedFieldSelector(
        reduxState,
        props,
        state.commonFields.value,
        { fallback: kids, stateKey: id }
      );
    },
  },
  requiresUniqueId: false,
};

function parsedText({ postprocess }: TextOptions = {}) {
  return {
    ...textFactory({ postprocess }),
    textContent: { source: 'kids' as const },
  };
}

function targetableText({ postprocess }: TextOptions = {}) {
  return {
    ...textFactory({ postprocess }),
    parserMixin: targetableTextMixin,
    textContent: { source: 'value' as const },
  };
}

export const text = Object.assign((options: TextOptions = {}) => parsedText(options), {
  raw: () => parsedText({ postprocess: 'raw' }),
  stripIndent: () => parsedText({ postprocess: 'stripIndent' }),
  withTarget: Object.assign(
    (options: TextOptions = {}) => targetableText(options),
    {
      raw: () => targetableText({ postprocess: 'raw' }),
      stripIndent: () => targetableText({ postprocess: 'stripIndent' }),
    }
  ),
});

/**
 * Add runtime templates to a structural text parser.
 *
 * Usage:
 *   ...parsers.textWithTemplate(parsers.text.stripIndent())
 *   ...parsers.textWithTemplate(parsers.text.withTarget(), { defaultMode: 'state' })
 * Renderer: `const { text, ...status } = useTextWithTemplate(props)`
 *
 * Templates apply only to parsed inline/src text. Reactive `target=` and
 * writable values remain data. A future deliberately dynamic escape hatch
 * should be explicit (for example, `state:withValue`).
 *
 * TODO(template-compile): Compile authored templates into static segments and
 * expression ASTs here at parse time, including their state references. The
 * built player can then skip template hooks/scans for literal text (the large
 * majority of blocks), validate expressions while authoring, and request the
 * referenced state from the server statically. Keep an explicit dynamic mode
 * such as `state:withValue` possible, but do not make value text executable by
 * default.
 */
export function textWithTemplate<T extends {
  textContent: { source: 'kids' | 'value' };
  parserMixin?: { attributes?: z.AnyZodObject; [key: string]: unknown };
}>(parser: T, { defaultMode = 'none' }: { defaultMode?: TextTemplateMode } = {}) {
  const attributes = parser.parserMixin?.attributes
    ? parser.parserMixin.attributes.extend(templateAttribute)
    : z.object(templateAttribute).strict();

  return {
    ...parser,
    parserMixin: { ...parser.parserMixin, attributes },
    textContent: { ...parser.textContent, defaultTemplateMode: defaultMode },
  };
}

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
    const { id, tag, attributes, source, parseDeps: parseDepsIn, rawParsed, storeEntry, metadata, provider } = ctx;
    const tagParsed = rawParsed[tag];
    let parseDeps = parseDepsIn;

    // Extract text content (same mechanism as text parser)
    let textContent: string;
    if (attributes?.src) {
      const loaded = await loadExternalSource({ src: attributes.src, provider, source, parseDeps });
      textContent = loaded.text.trim();
      parseDeps = [...parseDeps, loaded.dep];
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
      source,
      parseDeps,
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
    source,
    parseDeps: parseDepsIn,
    provider,
    parseNode,
    storeEntry,
    errors,
    metadata
  }) {
    const tagParsed = rawParsed[tag];
    const kids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];

    let extracted;
    let parseDeps = parseDepsIn;
    if (attributes?.src) {
      const loaded = await loadExternalSource({ src: attributes.src, provider, source, parseDeps });
      extracted = { type: 'text', text: loaded.text };
      parseDeps = [...parseDeps, loaded.dep];
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
        source,
        parseDeps,
        rawParsed,
        kids: processedKids,
        ...(metadata || {})  // Spread metadata fields flat into entry
      };
    } catch (parseError) {
      const provenance = [source, ...parseDeps];
      const errorObj: OLXLoadingError = {
        type: 'peg_error' as const,
        title: `Dialogue parsing error in ${provenance.join(' → ')}`,
        message: parseError.message,
        location: {
          provenance,
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
        source,
        parseDeps,
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
    source,
    parseDeps: parseDepsIn,
    provider,
    storeEntry,
    errors,
    metadata
  }) {
    const tagParsed = rawParsed[tag];
    const kids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];

    let parseDeps = parseDepsIn;
    let textContent: string;
    if (attributes?.src) {
      const loaded = await loadExternalSource({ src: attributes.src, provider, source, parseDeps });
      textContent = loaded.text;
      parseDeps = [...parseDeps, loaded.dep];
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
        source,
        parseDeps,
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

      const provenance = [source, ...parseDeps];
      const errorObj: OLXLoadingError = {
        type: 'parse_error' as const,
        title: `YAML parse error in ${provenance.join(' → ')}`,
        message,
        location: {
          provenance,
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
        source,
        parseDeps,
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
  function assetSrcParser({ id, tag, attributes, source, parseDeps, storeEntry, provider }) {
    const { src, ...otherAttributes } = attributes;

    let resolvedSrc = src;
    let updatedParseDeps = parseDeps;

    // Resolve relative paths and track the asset as a dependency
    if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//') && !src.startsWith('/')) {
      if (source && provider?.resolveRelativePath) {
        resolvedSrc = provider.resolveRelativePath(source, src);

        // HACK: This ref has no real version because the parser is synchronous
        // and can't call provider.read(). We use a placeholder version so it's
        // structurally valid as LofsCanonical. Making the parser async would
        // let us get real canonical source/parseDeps (mtime, content hash) here.
        if (provider.toLofsRef) {
          const assetRef = withVersion(provider.toLofsRef(resolvedSrc), toLofsVersion('unresolved'));
          updatedParseDeps = [...parseDeps, toLofsCanonical(assetRef)];
        }
      }
    }

    storeEntry(id, { id, tag, attributes: { ...otherAttributes, src: resolvedSrc }, source, parseDeps: updatedParseDeps, kids: [] });
    return id;
  }

  return { parser: assetSrcParser, staticKids: () => [], childMode: 'none' as ChildMode };
};
export const assetSrc = assetSrcFactory;
