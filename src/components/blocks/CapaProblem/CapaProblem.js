// src/components/blocks/CapaProblem/CapaProblem.js
import { dev, reduxId } from '@/lib/blocks';
import { isBlockTag } from '@/lib/util';
import { COMPONENT_MAP } from '@/components/componentMap';
import _CapaProblem from './_CapaProblem';

// CapaProblem parser responsibilities:
// 1. Assign predictable IDs to child blocks (grader_0, input_0, etc.)
// 2. Track grader-input relationships for auto-wiring the `target` attribute
// 3. Parse mixed content (blocks + HTML + text) for rendering
//
// Child blocks use their own parsers (e.g., graders use blocks.allowHTML(),
// PEG blocks use peggyParser). This parser handles the container-level concerns.
async function capaParser({ id, tag, attributes, provenance, rawParsed, storeEntry, parseNode }) {
  const tagParsed = rawParsed[tag];
  const rawKids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
  let inputIndex = 0;
  let graderIndex = 0;
  let nodeIndex = 0;
  const graders = [];

  // Parse children, tracking grader-input relationships
  async function parseChild(node, currentGrader = null) {
    // Handle text nodes
    if (node['#text'] !== undefined) {
      const text = node['#text'];
      if (text.trim() === '') return null;
      return { type: 'text', text };
    }

    // Skip comments
    if (node['#comment'] !== undefined) return null;

    const childTag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!childTag) return null;
    const childAttrs = node[':@'] ?? {};

    /* TODO: from Open edX OLX, we need to handle cases like:
      if (childTag === 'Label')
      if (childTag === 'Description')
      if (childTag === 'ResponseParam')
    */

    if (isBlockTag(childTag)) {
      const component = COMPONENT_MAP[childTag];
      if (!component) {
        console.warn(`[CapaProblem] Unknown block type: <${childTag}>. Block will be rendered with default parser.`);
      }
      const blueprint = component?.blueprint;

      // Assign predictable IDs based on block type
      let defaultId;
      if (blueprint && blueprint.isGrader) {
        defaultId = `${id}_grader_${graderIndex++}`;
      } else if (blueprint && blueprint.getValue) {
        defaultId = `${id}_input_${inputIndex++}`;
      } else {
        defaultId = `${id}_${childTag.toLowerCase()}_${nodeIndex++}`;
      }
      const blockId = reduxId(childAttrs, defaultId);

      // Track grader context
      let mapping = currentGrader;
      if (blueprint && blueprint.isGrader) {
        mapping = { id: blockId, inputs: [] };
        graders.push(mapping);
      }

      // Track inputs for grader association
      if (blueprint && blueprint.getValue && currentGrader) {
        currentGrader.inputs.push(blockId);
      }

      // Recurse into children to track nested inputs
      const kids = node[childTag];
      const kidsArray = Array.isArray(kids) ? kids : (kids ? [kids] : []);
      for (let i = 0; i < kidsArray.length; i++) {
        await parseChild(kidsArray[i], mapping);
      }

      // Invoke the block's parser with our computed ID
      const nodeWithId = {
        ...node,
        ':@': { ...childAttrs, id: blockId }
      };
      await parseNode(nodeWithId, kidsArray, 0);

      return { type: 'block', id: blockId };
    }

    // HTML tag - parse children recursively for grader tracking
    const kids = node[childTag];
    const kidsArray = Array.isArray(kids) ? kids : [];
    const childKids = [];
    for (const n of kidsArray) {
      const result = await parseChild(n, currentGrader);
      if (result) childKids.push(result);
    }
    return { type: 'html', tag: childTag, attributes: childAttrs, id: childAttrs.id, kids: childKids };
  }

  // Parse all children
  const kidsParsed = [];
  for (const n of rawKids) {
    const result = await parseChild(n, null);
    if (result) kidsParsed.push(result);
  }

  // Auto-wire grader targets after parsing
  graders.forEach(g => {
    if (g.inputs.length > 0) {
      storeEntry(g.id, (existing) => ({
        ...existing,
        attributes: { ...existing.attributes, target: g.inputs.join(',') }
      }));
    }
  });

  const entry = { id, tag, attributes, provenance, rawParsed, kids: kidsParsed };
  storeEntry(id, entry);
  return id;
}

function collectIds(nodes = []) {
  return nodes.flatMap(n => {
    if (!n) return [];
    if (n.type === 'block' && n.id) return [n.id];
    if (n.type === 'html') return collectIds(n.kids);
    return [];
  });
}

capaParser.staticKids = entry => collectIds(entry.kids);

const CapaProblem = dev({
  parser: capaParser,
  staticKids: capaParser.staticKids,
  name: 'CapaProblem',
  description: 'Interactive problem container with inputs, grading, and automatic check/status buttons',
  component: _CapaProblem
});

export default CapaProblem;

