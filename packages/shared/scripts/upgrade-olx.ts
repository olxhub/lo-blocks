#!/usr/bin/env node
// packages/shared/scripts/upgrade-olx.ts
//
// Upgrade OLX 1.0 (Open edX Studio exports) to OLX 2.0 (Learning Observer) format.
//
// This is a reusable migration tool, not a one-off script. It:
// - Loads the fragmented OLX 1.0 file structure into a unified tree
// - Generates semantic IDs from display_names (replacing Studio hashes)
// - Converts OLX 1.0 tags/structures to OLX 2.0 equivalents
// - Emits clean, human-readable OLX 2.0 files (one per sequential)
// - Reports missing blocks and conversion issues
//
// Usage:
//   npm run upgrade-olx -- <input-dir> [output-dir]
//
// Example:
//   npm run upgrade-olx -- DartmouthX-EngX/course content/DartmouthX-EngX
//
// THIS CODE IS A PROTOTYPE, AND OUTPUT STILL REQUIRES MANUAL VERIFICATION
//

import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

// ============================================================================
// Types
// ============================================================================

interface OlxV1Node {
  tag: string;
  attributes: Record<string, string>;
  children: OlxV1Node[];
  text: string;         // Text content (for leaf nodes / mixed content)
  htmlContent?: string; // For <html> blocks: the loaded .html file content
}

interface OlxV2Node {
  tag: string;
  attributes: Record<string, string>;
  children: OlxV2Node[];
  text: string;        // For text content (Markdown, Explanation, etc.)
  selfClosing?: boolean;
  comment?: string;     // XML comment to place before this node
}

interface ConversionStats {
  totalBlocks: number;
  converted: Record<string, number>;
  missing: Record<string, number>;
  warnings: string[];
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: npm run upgrade-olx -- <input-dir> [output-dir]');
  console.error('Example: npm run upgrade-olx -- DartmouthX-EngX/course content/DartmouthX-EngX');
  process.exit(1);
}

const inputDir = path.resolve(args[0]);
const outputDir = path.resolve(args[1] || 'content/imported');

// ============================================================================
// Step 1: Load OLX 1.0 Course Tree
// ============================================================================

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  commentPropName: '#comment',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  // v5 uses different option names
  unpairedTags: ['img', 'br', 'hr', 'track'],
  stopNodes: ['*.script'],
});

function parseXmlFile(filePath: string): any[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return xmlParser.parse(content);
}

/**
 * Convert fast-xml-parser's preserveOrder format into our OlxV1Node tree.
 * preserveOrder gives us: [{ tagName: [...children], ':@': { attrs } }, ...]
 */
function fxpToOlxV1Node(fxpNodes: any[]): OlxV1Node[] {
  const results: OlxV1Node[] = [];

  for (const node of fxpNodes) {
    // Text node
    if ('#text' in node) {
      // We'll handle text inline in the parent
      continue;
    }
    // Comment node
    if ('#comment' in node) {
      continue;
    }

    const attrs = node[':@'] || {};
    // Find the tag name (it's the key that isn't ':@')
    const tag = Object.keys(node).find(k => k !== ':@');
    if (!tag) continue;

    const childFxp = node[tag] || [];
    const v1Node: OlxV1Node = {
      tag,
      attributes: { ...attrs },
      children: [],
      text: '',
    };

    // Extract text and child elements
    const textParts: string[] = [];
    const childElements: any[] = [];

    // With our parser config (no cdataPropName), CDATA is folded into #text.
    for (const child of childFxp) {
      if ('#text' in child) {
        textParts.push(child['#text']);
      } else {
        childElements.push(child);
      }
    }

    v1Node.text = textParts.join('');
    v1Node.children = fxpToOlxV1Node(childElements);

    results.push(v1Node);
  }

  return results;
}

/**
 * Recursively load the OLX 1.0 course tree, inlining all url_name references.
 * This mirrors edxml-tools/helpers.py:load_subtree().
 */
function loadOlx1Tree(baseDir: string): OlxV1Node {
  // Find the root course.xml - it might be at baseDir/course.xml or baseDir/course/course.xml
  let courseXmlPath = path.join(baseDir, 'course.xml');
  if (!fs.existsSync(courseXmlPath)) {
    const nested = path.join(baseDir, 'course', 'course.xml');
    if (fs.existsSync(nested)) {
      courseXmlPath = nested;
    } else {
      throw new Error(`Cannot find course.xml in ${baseDir}`);
    }
  }

  // The course.xml may point to another file via url_name
  const parsed = parseXmlFile(courseXmlPath);
  const nodes = fxpToOlxV1Node(parsed);
  if (nodes.length === 0) throw new Error('Empty course.xml');

  const root = nodes[0];

  // If root has a url_name pointing to another file, load it
  if (root.attributes.url_name || root.attributes.org) {
    const urlName = root.attributes.url_name;
    if (urlName) {
      const subFile = path.join(baseDir, root.tag, urlName + '.xml');
      if (fs.existsSync(subFile)) {
        const subParsed = parseXmlFile(subFile);
        const subNodes = fxpToOlxV1Node(subParsed);
        if (subNodes.length > 0) {
          const subRoot = subNodes[0];
          // Merge: sub-file attributes + children replace the stub
          Object.assign(root.attributes, subRoot.attributes);
          root.children = subRoot.children;
          root.text = subRoot.text;
        }
      }
    }
  }

  // Recursively expand all children
  expandChildren(baseDir, root);
  return root;
}

function expandChildren(baseDir: string, node: OlxV1Node): void {
  const expandedChildren: OlxV1Node[] = [];

  for (const child of node.children) {
    const expanded = expandNode(baseDir, child);
    expandedChildren.push(expanded);
  }

  node.children = expandedChildren;
}

function expandNode(baseDir: string, node: OlxV1Node): OlxV1Node {
  const urlName = node.attributes.url_name;

  // If this node has a url_name and there's a corresponding file, inline it
  if (urlName) {
    const subDir = path.join(baseDir, node.tag);
    const subFile = path.join(subDir, urlName + '.xml');

    if (fs.existsSync(subFile)) {
      const subParsed = parseXmlFile(subFile);
      const subNodes = fxpToOlxV1Node(subParsed);

      if (subNodes.length > 0) {
        const subRoot = subNodes[0];

        if (subRoot.tag === node.tag) {
          // Same tag: merge attributes and replace children
          // Keep original attributes, overlay sub-file attributes
          const mergedAttrs = { ...node.attributes, ...subRoot.attributes };
          node.attributes = mergedAttrs;
          node.children = subRoot.children;
          node.text = subRoot.text;
        } else {
          // Different tag: append as child
          node.children = [subRoot];
        }
      }
    }
  }

  // Special case: html blocks have a companion .html file
  if (node.tag === 'html') {
    const filename = node.attributes.filename || node.attributes.url_name;
    if (filename) {
      // Strip .html extension if already present to avoid double-extension
      const base = filename.replace(/\.html$/i, '');
      const htmlFile = path.join(baseDir, 'html', base + '.html');
      if (fs.existsSync(htmlFile)) {
        node.htmlContent = fs.readFileSync(htmlFile, 'utf-8');
      }
    }
  }

  // Recursively expand children
  expandChildren(baseDir, node);
  return node;
}

// ============================================================================
// Step 1b: Load user_partitions from policy.json (for split_test group names)
// ============================================================================

interface PartitionGroup {
  id: number;
  name: string;
}

interface UserPartition {
  id: number;
  name: string;
  description: string;
  groups: PartitionGroup[];
}

/** Map from group numeric ID → group name, across all partitions. */
const groupIdToName: Map<number, string> = new Map();
/** Map from partition ID → partition info. */
const partitionMap: Map<number, UserPartition> = new Map();

function loadUserPartitions(baseDir: string): void {
  const policyPath = path.join(baseDir, 'policies', 'course', 'policy.json');
  if (!fs.existsSync(policyPath)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
    // Policy JSON may be nested under "course/course" or at top level
    const coursePolicy = raw['course/course'] || raw;
    const partitions: UserPartition[] = coursePolicy.user_partitions || [];

    for (const partition of partitions) {
      partitionMap.set(partition.id, partition);
      for (const group of partition.groups) {
        groupIdToName.set(group.id, group.name);
      }
    }
  } catch (e) {
    warn(`Failed to parse policy.json for user_partitions: ${e}`);
  }
}

// ============================================================================
// Step 2: Generate Semantic IDs
// ============================================================================

const STUDIO_HASH_RE = /^[a-f0-9]{32}$/;

function isStudioHash(s: string): boolean {
  return STUDIO_HASH_RE.test(s);
}

function slugify(s: string): string {
  // Convert to lowercase, replace non-alphanumeric with underscore
  let slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')     // Consolidate
    .replace(/^_|_$/g, '');  // Trim

  // Ensure it starts with a letter
  if (slug && /^[0-9]/.test(slug)) {
    slug = 'n_' + slug;
  }

  return slug || 'unnamed';
}

const usedIds = new Set<string>();

function makeUniqueId(base: string): string {
  let id = base;
  if (usedIds.has(id)) {
    let i = 1;
    while (usedIds.has(id + '_' + i)) i++;
    id = id + '_' + i;
  }
  usedIds.add(id);
  return id;
}

/**
 * Minimal sanitization for OLX 2.0 IDs — replace invalid characters with
 * underscores but preserve case and structure. For human-authored url_names
 * that are already meaningful (e.g. "eigen_pset", "hw2-problem3").
 */
function sanitizeId(s: string): string {
  let id = s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (id && /^[0-9]/.test(id)) id = 'n_' + id;
  return id || 'unnamed';
}

/**
 * Assign semantic IDs throughout the tree.
 * - Replace Studio hashes (32-char hex) with slugified display_names
 * - Preserve human-authored url_names (only sanitize for OLX 2.0 validity)
 * - Propagate display_name from parent to child where missing
 * - Ensure uniqueness
 */
function assignSemanticIds(node: OlxV1Node, parentName?: string): void {
  const displayName = node.attributes.display_name;
  const urlName = node.attributes.url_name;

  // Preserve the original url_name before mutation so that later stages
  // (e.g. split_test group_id_to_child lookup) can match against it.
  if (urlName) node.attributes._original_url_name = urlName;

  // Propagate display_name from parent if missing
  if (!displayName && parentName) {
    node.attributes.display_name = parentName;
  }

  if (!urlName || isStudioHash(urlName)) {
    // Studio hash or missing: generate a semantic ID from display_name
    const nameSource = node.attributes.display_name || parentName || node.tag;
    node.attributes.url_name = makeUniqueId(slugify(nameSource));
  } else {
    // Human-authored url_name: preserve it, only sanitize invalid chars
    node.attributes.url_name = makeUniqueId(sanitizeId(urlName));
  }

  // Recurse
  for (const child of node.children) {
    assignSemanticIds(child, node.attributes.display_name);
  }
}

// ============================================================================
// Step 3: Transform to OLX 2.0
// ============================================================================

const stats: ConversionStats = {
  totalBlocks: 0,
  converted: {},
  missing: {},
  warnings: [],
};

function countConverted(tag: string): void {
  stats.converted[tag] = (stats.converted[tag] || 0) + 1;
  stats.totalBlocks++;
}

function countMissing(tag: string): void {
  stats.missing[tag] = (stats.missing[tag] || 0) + 1;
  stats.totalBlocks++;
}

function warn(msg: string): void {
  stats.warnings.push(msg);
}

// --- Tag transforms ---

const TAG_MAP: Record<string, string> = {
  course: 'Course',
  chapter: 'Chapter',
  sequential: 'Sequential',
  vertical: 'Vertical',
};

/**
 * Unwrap single-child Verticals throughout the tree.
 * <Vertical><Markdown/></Vertical> → <Markdown/>
 * Carries forward id/title from the Vertical if the child lacks them.
 */
function unwrapSingleChildVerticals(node: OlxV2Node): OlxV2Node {
  // First, recurse into children
  node.children = node.children.map(unwrapSingleChildVerticals);

  // Then check if this node is a Vertical with exactly one child
  if (node.tag === 'Vertical' && node.children.length === 1 && !node.text) {
    const child = node.children[0];
    // Carry forward id/title if the child doesn't have them
    if (!child.attributes.id && node.attributes.id) {
      child.attributes.id = node.attributes.id;
    }
    if (!child.attributes.title && node.attributes.title) {
      child.attributes.title = node.attributes.title;
    }
    child.comment = child.comment || node.comment;
    return child;
  }

  return node;
}

function transformNode(node: OlxV1Node): OlxV2Node | OlxV2Node[] | null {
  // Structural tags
  if (TAG_MAP[node.tag]) {
    return transformStructural(node);
  }

  switch (node.tag) {
    case 'html':
      return transformHtml(node);
    case 'video':
      return transformVideo(node);
    case 'problem':
      return transformProblem(node);
    case 'discussion':
      return transformDiscussion(node);
    case 'split_test':
      return transformSplitTest(node);
    case 'wiki':
      return null; // Skip wiki references
    default:
      warn(`Unknown OLX 1.0 tag: <${node.tag}>`);
      countMissing(node.tag);
      return transformUnknown(node);
  }
}

function transformStructural(node: OlxV1Node): OlxV2Node {
  const tag = TAG_MAP[node.tag];
  const id = node.attributes.url_name;
  const title = cleanDisplayName(node.attributes.display_name || '');
  const attrs: Record<string, string> = { id };
  if (title) attrs.title = title;

  countConverted(node.tag);

  const children: OlxV2Node[] = [];
  for (const child of node.children) {
    const transformed = transformNode(child);
    if (transformed) {
      if (Array.isArray(transformed)) {
        children.push(...transformed);
      } else {
        children.push(transformed);
      }
    }
  }

  return { tag, attributes: attrs, children, text: '' };
}

function cleanDisplayName(name: string): string {
  // Remove surrounding quotes that edX sometimes adds
  return name.replace(/^["']|["']$/g, '').trim();
}

function transformHtml(node: OlxV1Node): OlxV2Node {
  const id = node.attributes.url_name;
  const title = cleanDisplayName(node.attributes.display_name || '');

  countConverted('html');

  // Use the loaded HTML content
  let content = node.htmlContent || node.text || '';
  content = content.trim();

  if (!content) {
    return {
      tag: 'Markdown',
      attributes: { id },
      children: [],
      text: title ? `## ${title}\n\n*(Empty content block)*` : '*(Empty content block)*',
    };
  }

  return {
    tag: 'Html',
    attributes: { id },
    children: [],
    text: content,
  };
}

function transformVideo(node: OlxV1Node): OlxV2Node {
  const id = node.attributes.url_name;
  const title = cleanDisplayName(node.attributes.display_name || 'Video');
  const youtubeId = node.attributes.youtube_id_1_0 || '';
  const edxVideoId = node.attributes.edx_video_id || '';

  countMissing('video');

  // Extract encoded video URLs
  const videoUrls: string[] = [];
  for (const child of node.children) {
    if (child.tag === 'video_asset') {
      for (const enc of child.children) {
        if (enc.tag === 'encoded_video' && enc.attributes.url) {
          const profile = enc.attributes.profile || 'unknown';
          videoUrls.push(`- ${profile}: ${enc.attributes.url}`);
        }
      }
    }
  }

  // Build placeholder content
  const lines = [`**Video: ${title}**`, ''];
  if (youtubeId) {
    lines.push(`YouTube: https://www.youtube.com/watch?v=${youtubeId}`);
  }
  if (edxVideoId) {
    lines.push(`edX Video ID: \`${edxVideoId}\``);
  }
  if (videoUrls.length > 0) {
    lines.push('', 'Sources:', ...videoUrls);
  }

  return {
    tag: 'Markdown',
    attributes: { id },
    children: [],
    text: lines.join('\n'),
    comment: `TODO: Replace with <Video> block when available. Original: <video display_name="${title}">`,
  };
}

function transformProblem(node: OlxV1Node): OlxV2Node | OlxV2Node[] {
  const id = node.attributes.url_name;
  const title = cleanDisplayName(node.attributes.display_name || 'Problem');

  // Detect response type
  const responseType = findResponseType(node);

  switch (responseType) {
    case 'multiplechoiceresponse':
      return transformMCQ(node, id, title);
    case 'choiceresponse':
      return transformCheckbox(node, id, title);
    case 'customresponse':
      return transformCustomResponse(node, id, title);
    default:
      warn(`Unknown problem response type in "${title}" (id: ${id})`);
      countMissing('problem/' + (responseType || 'unknown'));
      return transformUnknownProblem(node, id, title);
  }
}

function findResponseType(node: OlxV1Node): string | null {
  for (const child of node.children) {
    if (child.tag.endsWith('response')) return child.tag;
    const found = findResponseType(child);
    if (found) return found;
  }
  return null;
}

function findNodeByTag(node: OlxV1Node, tag: string): OlxV1Node | null {
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const found = findNodeByTag(child, tag);
    if (found) return found;
  }
  return null;
}

function findAllNodesByTag(node: OlxV1Node, tag: string): OlxV1Node[] {
  const results: OlxV1Node[] = [];
  if (node.tag === tag) results.push(node);
  for (const child of node.children) {
    results.push(...findAllNodesByTag(child, tag));
  }
  return results;
}

/**
 * Extract the prompt text from a problem node.
 * The prompt is everything before the response element: <p>, <img>, etc.
 */
function extractPromptAndImages(node: OlxV1Node): { promptHtml: string; images: OlxV2Node[] } {
  const promptParts: string[] = [];
  const images: OlxV2Node[] = [];

  for (const child of node.children) {
    // Stop at response elements
    if (child.tag.endsWith('response') || child.tag === 'solution' || child.tag === 'demandhint') {
      break;
    }

    // Skip scripts
    if (child.tag === 'script' || child.tag === 'span') continue;

    // Extract images as separate OLX blocks
    if (child.tag === 'img') {
      const src = fixStaticPath(child.attributes.src || '');
      const alt = child.attributes.alt || '';
      images.push({
        tag: 'Image',
        attributes: { src, ...(alt ? { alt } : {}) },
        children: [],
        text: '',
        selfClosing: true,
      });
      continue;
    }

    // Accumulate HTML for the prompt
    promptParts.push(edxNodeToHtml(child));
  }

  return { promptHtml: promptParts.join('\n').trim(), images };
}

function fixStaticPath(src: string): string {
  // /static/foo.jpg → static/foo.jpg
  return src.replace(/^\/static\//, 'static/');
}

/**
 * Reconstruct HTML from an OlxV1Node (for prompt text within problems).
 */
function edxNodeToHtml(node: OlxV1Node): string {
  if (node.tag === '#text') return node.text;

  const attrs = Object.entries(node.attributes)
    .filter(([k]) => k !== 'url_name' && k !== 'display_name')
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');

  // Fix image sources within HTML
  if (node.tag === 'img') {
    const fixedAttrs = Object.entries(node.attributes)
      .map(([k, v]) => {
        if (k === 'src') v = fixStaticPath(v);
        return ` ${k}="${escapeAttr(v)}"`;
      })
      .join('');
    return `<img${fixedAttrs}/>`;
  }

  const childHtml = node.children.map(c => edxNodeToHtml(c)).join('');
  const textContent = node.text || '';

  if (!childHtml && !textContent) {
    return `<${node.tag}${attrs}/>`;
  }

  return `<${node.tag}${attrs}>${textContent}${childHtml}</${node.tag}>`;
}

/**
 * Extract explanation text from a <solution> element.
 */
function extractExplanation(node: OlxV1Node): string | null {
  const solution = findNodeByTag(node, 'solution');
  if (!solution) return null;

  // The typical structure is <solution><div class="detailed-solution"><p>Explanation</p><p>actual text</p></div></solution>
  // Extract all text, skipping the "Explanation" header
  const parts = collectText(solution);
  // Filter out the bare "Explanation" header
  const filtered = parts.filter(p => p.trim().toLowerCase() !== 'explanation');
  const text = filtered.join('\n').trim();
  return text || null;
}

function collectText(node: OlxV1Node): string[] {
  const parts: string[] = [];
  if (node.text.trim()) {
    parts.push(node.text.trim());
  }
  for (const child of node.children) {
    // For images within explanations, produce HTML
    if (child.tag === 'img') {
      const src = fixStaticPath(child.attributes.src || '');
      parts.push(`<img src="${escapeAttr(src)}"/>`);
    } else {
      parts.push(...collectText(child));
    }
  }
  return parts;
}

function transformMCQ(node: OlxV1Node, id: string, title: string): OlxV2Node {
  countConverted('multiplechoiceresponse');

  const { promptHtml, images } = extractPromptAndImages(node);
  const choicegroup = findNodeByTag(node, 'choicegroup');
  const explanation = extractExplanation(node);

  const children: OlxV2Node[] = [];

  // Prompt
  if (promptHtml) {
    children.push({
      tag: 'Markdown',
      attributes: {},
      children: [],
      text: promptHtml,
    });
  }

  // Images
  children.push(...images);

  // ChoiceInput inside KeyGrader
  if (choicegroup) {
    const choiceNodes: OlxV2Node[] = [];
    for (const choice of choicegroup.children) {
      if (choice.tag !== 'choice') continue;
      const correct = choice.attributes.correct === 'true';
      const choiceText = choice.text.trim() || collectText(choice).join(' ').trim();
      choiceNodes.push({
        tag: correct ? 'Key' : 'Distractor',
        attributes: {},
        children: [],
        text: choiceText,
      });
    }

    children.push({
      tag: 'KeyGrader',
      attributes: {},
      children: [{
        tag: 'ChoiceInput',
        attributes: {},
        children: choiceNodes,
        text: '',
      }],
      text: '',
    });
  }

  // Explanation
  if (explanation) {
    children.push({
      tag: 'Explanation',
      attributes: { id: id + '_explanation' },
      children: [],
      text: explanation,
    });
  }

  return {
    tag: 'CapaProblem',
    attributes: { id, title },
    children,
    text: '',
  };
}

function transformCheckbox(node: OlxV1Node, id: string, title: string): OlxV2Node {
  countConverted('choiceresponse');

  const { promptHtml, images } = extractPromptAndImages(node);
  const checkboxgroup = findNodeByTag(node, 'checkboxgroup');
  const explanation = extractExplanation(node);

  const children: OlxV2Node[] = [];

  if (promptHtml) {
    children.push({
      tag: 'Markdown',
      attributes: {},
      children: [],
      text: promptHtml,
    });
  }

  children.push(...images);

  if (checkboxgroup) {
    const choiceNodes: OlxV2Node[] = [];
    for (const choice of checkboxgroup.children) {
      if (choice.tag !== 'choice') continue;
      const correct = choice.attributes.correct === 'true';
      const choiceText = choice.text.trim() || collectText(choice).join(' ').trim();
      choiceNodes.push({
        tag: correct ? 'Key' : 'Distractor',
        attributes: {},
        children: [],
        text: choiceText,
      });
    }

    children.push({
      tag: 'CheckboxGrader',
      attributes: {},
      children: [{
        tag: 'CheckboxInput',
        attributes: {},
        children: choiceNodes,
        text: '',
      }],
      text: '',
    });
  }

  if (explanation) {
    children.push({
      tag: 'Explanation',
      attributes: { id: id + '_explanation' },
      children: [],
      text: explanation,
    });
  }

  return {
    tag: 'CapaProblem',
    attributes: { id, title },
    children,
    text: '',
  };
}

function transformCustomResponse(node: OlxV1Node, id: string, title: string): OlxV2Node {
  // Assumes customresponse is survey/reflection with trivial grading (accept anything).
  // This is true for DartmouthX-EngX but may not hold for other courses.
  // TODO: Detect non-trivial custom graders and emit a warning or different conversion.
  warn(`customresponse "${title}": assumed to be survey/reflection — verify manually`);
  countConverted('customresponse');

  const { promptHtml, images } = extractPromptAndImages(node);
  const explanation = extractExplanation(node);

  const children: OlxV2Node[] = [];

  if (promptHtml) {
    children.push({
      tag: 'Markdown',
      attributes: {},
      children: [],
      text: promptHtml,
    });
  }

  children.push(...images);

  children.push({
    tag: 'TextArea',
    attributes: { id: id + '_input', placeholder: 'Enter your response...' },
    children: [],
    text: '',
    selfClosing: true,
  });

  if (explanation) {
    children.push({
      tag: 'Explanation',
      attributes: { id: id + '_explanation' },
      children: [],
      text: explanation,
    });
  }

  return {
    tag: 'Vertical',
    attributes: { id, title },
    children,
    text: '',
    comment: 'Converted from customresponse (survey/reflection - original accepted any answer)',
  };
}

function transformDiscussion(node: OlxV1Node): OlxV2Node {
  const id = node.attributes.url_name;
  const title = cleanDisplayName(node.attributes.display_name || 'Discussion');
  const target = node.attributes.discussion_target || '';
  const category = node.attributes.discussion_category || '';

  countMissing('discussion');

  const lines = [`**Discussion: ${title}**`];
  if (target) lines.push(`Topic: ${target}`);
  if (category) lines.push(`Category: ${category}`);

  return {
    tag: 'Markdown',
    attributes: { id },
    children: [],
    text: lines.join('\n'),
    comment: 'TODO: Replace with <Discussion> block when available',
  };
}

/**
 * Convert a human-readable name to a CamelCase analytics ID.
 * "Group A" → "GroupA", "Group ID 602361593" → "GroupID602361593"
 * Non-alphanumeric characters (other than spaces, which are removed) become underscores.
 */
function toCamelId(s: string): string {
  // Strip apostrophes/quotes (Owl's → Owls, not Owl_s)
  const stripped = s.replace(/['']/g, '');
  // CamelCase: capitalize first letter of each word, remove spaces
  const camel = stripped.replace(/(?:^|\s+)(\S)/g, (_, c) => c.toUpperCase());
  // Replace remaining non-alphanumeric with underscore
  return camel.replace(/[^0-9a-zA-Z]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function transformSplitTest(node: OlxV1Node): OlxV2Node | null {
  const title = cleanDisplayName(node.attributes.display_name || 'Content Experiment');
  const id = node.attributes.url_name;

  countConverted('split_test');

  if (node.children.length === 0) {
    warn(`Empty split_test: ${title}`);
    return null;
  }

  // Build reverse map from child url_name → numeric group ID.
  // The group_id_to_child mapping is JSON like:
  //   {"602361593": "i4x://DartmouthX/.../vertical/498b1b0c90d04131b032681e466f04bf", ...}
  // We extract the url_name (last path segment) to match against child nodes,
  // rather than assuming JSON key order matches XML child order.
  const childUrlNameToGroupId = new Map<string, number>();
  try {
    const mapping = JSON.parse(node.attributes.group_id_to_child || '{}');
    for (const [gid, childPath] of Object.entries(mapping)) {
      const urlName = String(childPath).split('/').pop();
      if (urlName) childUrlNameToGroupId.set(urlName, Number(gid));
    }
  } catch { /* ignore parse errors */ }

  // Transform each child group (typically verticals).
  // Tree is already fully expanded by loadV1Tree, no need to re-expand.
  const children: OlxV2Node[] = [];
  const groupInfo: { camelId: string; humanName: string }[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const transformed = transformNode(child);
    const result = Array.isArray(transformed) ? transformed[0] : transformed;
    if (!result) continue;

    children.push(result);

    // Resolve group name: policy.json partition names > display_name > fallback
    // Use _original_url_name (pre-semantic-ID) since group_id_to_child contains original hashes
    const originalUrlName = child.attributes._original_url_name || child.attributes.url_name;
    const numericId = childUrlNameToGroupId.get(originalUrlName);
    const partitionName = numericId !== undefined ? groupIdToName.get(numericId) : undefined;
    const displayName = cleanDisplayName(child.attributes.display_name || '');
    const humanName = partitionName || displayName || `Group ${children.length}`;
    const camelId = toCamelId(humanName);
    groupInfo.push({ camelId, humanName });

    // Override the child's title with the resolved group name when the
    // original was just a numeric group ID (e.g. "Group ID 602361593")
    if (partitionName && result.attributes.title && /^Group ID \d+/.test(result.attributes.title)) {
      result.attributes.title = partitionName;
    }
  }

  if (children.length === 0) {
    warn(`split_test "${title}": all children empty`);
    return null;
  }

  // groups= uses CamelCase IDs for analytics: Test5.GroupA, Test5.GroupB
  const attrs: Record<string, string> = { id };
  if (title) attrs.title = title;
  attrs.groups = groupInfo.map(g => g.camelId).join(',');

  // Build descriptive comment as a legend mapping CamelCase IDs to human names
  const splitTestId = toCamelId(title);
  const partitionId = parseInt(node.attributes.user_partition_id, 10);
  const partition = !isNaN(partitionId) ? partitionMap.get(partitionId) : undefined;
  const commentLines: string[] = [];
  if (partition && partition.description.trim()) {
    commentLines.push(partition.description.trim());
  }
  for (const g of groupInfo) {
    commentLines.push(`${splitTestId}.${g.camelId}:`);
    commentLines.push(`  name: ${g.humanName}`);
  }

  return {
    tag: 'SplitTest',
    attributes: attrs,
    children,
    text: '',
    comment: commentLines.join('\n     '),
  };
}

function transformUnknown(node: OlxV1Node): OlxV2Node {
  const id = node.attributes.url_name || slugify(node.tag);

  return {
    tag: 'Markdown',
    attributes: { id: makeUniqueId(id) },
    children: [],
    text: `**Unknown block: \`<${node.tag}>\`**\n\n\`\`\`\n${JSON.stringify(node.attributes, null, 2)}\n\`\`\``,
    comment: `TODO: Unknown OLX 1.0 tag <${node.tag}>`,
  };
}

function transformUnknownProblem(node: OlxV1Node, id: string, title: string): OlxV2Node {
  const { promptHtml } = extractPromptAndImages(node);

  return {
    tag: 'Markdown',
    attributes: { id },
    children: [],
    text: [
      `**Problem: ${title}**`,
      '',
      promptHtml || '*(No prompt extracted)*',
      '',
      `*(Unsupported problem type - manual conversion needed)*`,
    ].join('\n'),
    comment: `TODO: Manually convert problem "${title}"`,
  };
}

// ============================================================================
// Step 4: Emit OLX 2.0 Files
// ============================================================================

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Does this text contain HTML tags that would confuse an XML parser? */
function containsHtml(s: string): boolean {
  return /<[a-zA-Z]/.test(s);
}

/**
 * Wrap text in CDATA if it contains HTML, otherwise return as-is.
 * CDATA lets us embed raw HTML inside XML text elements without
 * the XML parser trying to interpret it as child nodes.
 */
function wrapTextContent(s: string): string {
  if (containsHtml(s)) {
    // CDATA cannot contain the sequence ]]>, so split if present
    const escaped = s.replace(/\]\]>/g, ']]]]><![CDATA[>');
    return `<![CDATA[${escaped}]]>`;
  }
  return s;
}

/**
 * Serialize an OlxV2Node tree to clean, indented XML.
 */
function serializeOlx(node: OlxV2Node, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];

  // Comment
  if (node.comment) {
    lines.push(`${pad}<!-- ${node.comment} -->`);
  }

  // Build attribute string
  const attrStr = Object.entries(node.attributes)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');

  // Leaf node with text content
  if (node.children.length === 0 && node.text) {
    const wrapped = wrapTextContent(node.text);
    // Multi-line text content (Markdown, Explanation, etc.)
    if (node.text.includes('\n') || node.text.length > 80) {
      lines.push(`${pad}<${node.tag}${attrStr}>`);
      for (const line of wrapped.split('\n')) {
        lines.push(line);
      }
      lines.push(`${pad}</${node.tag}>`);
    } else {
      lines.push(`${pad}<${node.tag}${attrStr}>${wrapped}</${node.tag}>`);
    }
    return lines.join('\n');
  }

  // Self-closing leaf
  if (node.children.length === 0 && !node.text) {
    lines.push(`${pad}<${node.tag}${attrStr} />`);
    return lines.join('\n');
  }

  // Node with children
  lines.push(`${pad}<${node.tag}${attrStr}>`);

  // Text before children
  if (node.text) {
    lines.push(wrapTextContent(node.text));
  }

  for (const child of node.children) {
    lines.push(serializeOlx(child, indent + 1));
  }

  lines.push(`${pad}</${node.tag}>`);
  return lines.join('\n');
}

function generateFrontmatter(description: string, category: string): string {
  // Escape quotes for YAML string value
  const escaped = description.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return [
    '<!--',
    '---',
    `description: "${escaped}"`,
    `category: ${category}`,
    'lang: en-Latn-US',
    '---',
    '-->',
  ].join('\n');
}

function emitFiles(courseNode: OlxV1Node): void {
  fs.mkdirSync(outputDir, { recursive: true });

  const courseId = courseNode.attributes.url_name;
  const courseTitle = cleanDisplayName(courseNode.attributes.display_name || 'Imported Course');
  const category = path.basename(outputDir);

  // Emit one file per sequential. Course.olx gets the Chapter structure
  // with Use refs pointing to each sequential file.
  // Chapter is a pseudo-element consumed by the Course parser, not a block.
  const chapterNodes: OlxV2Node[] = [];

  for (const chapter of courseNode.children) {
    if (chapter.tag !== 'chapter') continue;

    const transformed = transformNode(chapter);
    if (!transformed || Array.isArray(transformed)) continue;

    const chapterTitle = transformed.attributes.title || transformed.attributes.id;

    // Each child of the chapter (Sequential) becomes its own file
    const useRefs: OlxV2Node[] = [];
    for (const child of transformed.children) {
      // Unwrap single-child Verticals throughout the subtree
      const cleaned = unwrapSingleChildVerticals(child);
      const seqId = cleaned.attributes.id;
      if (!seqId) continue;

      const filename = seqId + '.olx';
      const frontmatter = generateFrontmatter(
        `${courseTitle} - ${chapterTitle} - ${cleaned.attributes.title || seqId}`,
        category,
      );
      const xml = serializeOlx(cleaned);
      fs.writeFileSync(path.join(outputDir, filename), frontmatter + '\n' + xml + '\n');
      console.log(`  ${filename}`);

      useRefs.push({
        tag: 'Use',
        attributes: { ref: seqId },
        children: [],
        text: '',
        selfClosing: true,
      });
    }

    chapterNodes.push({
      tag: 'Chapter',
      attributes: { id: transformed.attributes.id + '_ch', title: chapterTitle },
      children: useRefs,
      text: '',
    });
  }

  // Emit course file
  const courseFrontmatter = generateFrontmatter(courseTitle, category);
  const courseOlxV2Node: OlxV2Node = {
    tag: 'Course',
    attributes: { id: courseId, title: courseTitle, launchable: 'true' },
    children: chapterNodes,
    text: '',
  };

  const courseXml = serializeOlx(courseOlxV2Node);
  fs.writeFileSync(path.join(outputDir, 'course.olx'), courseFrontmatter + '\n' + courseXml + '\n');
  console.log('  course.olx');
}

// ============================================================================
// Step 5: Report
// ============================================================================

function printReport(): void {
  console.error('\n--- Conversion Report ---');
  console.error(`Total blocks processed: ${stats.totalBlocks}`);

  if (Object.keys(stats.converted).length > 0) {
    console.error('\nConverted:');
    for (const [tag, count] of Object.entries(stats.converted).sort()) {
      console.error(`  ${tag}: ${count}`);
    }
  }

  if (Object.keys(stats.missing).length > 0) {
    console.error('\nMissing blocks (placeholders used):');
    for (const [tag, count] of Object.entries(stats.missing).sort()) {
      console.error(`  ${tag}: ${count}`);
    }
  }

  if (stats.warnings.length > 0) {
    console.error(`\nWarnings (${stats.warnings.length}):`);
    for (const w of stats.warnings.slice(0, 20)) {
      console.error(`  - ${w}`);
    }
    if (stats.warnings.length > 20) {
      console.error(`  ... and ${stats.warnings.length - 20} more`);
    }
  }

  console.error('');
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  console.log(`Loading OLX 1.0 from: ${inputDir}`);

  // Step 1: Load
  const tree = loadOlx1Tree(inputDir);
  console.log(`Loaded course: ${tree.attributes.display_name || '(unnamed)'}`);

  // Step 1b: Load partition config for split_test group names
  loadUserPartitions(inputDir);

  // Step 2: Semantic IDs
  assignSemanticIds(tree);
  console.log(`Assigned semantic IDs (${usedIds.size} unique)`);

  // Step 3 + 4: Transform + Emit
  console.log(`\nWriting OLX 2.0 to: ${outputDir}`);
  emitFiles(tree);

  // Step 5: Report
  printReport();

  // Copy static files reminder
  const staticDir = path.join(inputDir, 'static');
  if (fs.existsSync(staticDir)) {
    console.log(`NOTE: Static files exist at ${staticDir}`);
    console.log(`  Copy them to: ${path.join(outputDir, 'static/')}`);
  }
}

main();
