// src/components/blocks/CapaProblem/CapaProblem.js
import { dev, reduxId } from '@/lib/blocks';
import { isBlockTag } from '@/lib/util';
import { COMPONENT_MAP } from '@/components/componentMap';
import _CapaProblem from './_CapaProblem';

// CapaProblem parser responsibilities:
// 1. Assign predictable IDs to ALL descendant blocks (grader_0, input_0, etc.)
// 2. Track grader-input relationships for auto-wiring the `target` attribute
// 3. Parse mixed content (blocks + HTML + text) for rendering
//
// Child blocks use their own parsers (e.g., graders use blocks.allowHTML(),
// PEG blocks use peggyParser). This parser handles the container-level concerns.
//
// IMPORTANT: IDs must be assigned BEFORE calling child parsers because child
// parsers (like blocksParser) call parseNode on their children, and parseNode
// generates hash-based IDs if no ID is in the attributes. By pre-assigning IDs
// to ALL descendant blocks (not just immediate children), we ensure consistent
// IDs scoped to this CapaProblem.
async function capaParser({ id, tag, attributes, provenance, rawParsed, storeEntry, parseNode }) {
  const tagParsed = rawParsed[tag];
  const rawKids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
  let inputIndex = 0;
  let graderIndex = 0;
  let nodeIndex = 0;
  const graders = [];

  // Phase 1: Pre-assign IDs to ALL descendant blocks and track grader/input relationships
  // This MUTATES the nodes to add id attributes before any parsing happens.
  // Without this, child parsers would generate hash-based IDs for nested blocks.
  function assignIds(node, currentGrader = null) {
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

    // Initialize attributes object if not present
    if (!node[':@']) {
      node[':@'] = {};
    }
    const childAttrs = node[':@'];

    /* TODO: from Open edX OLX, we need to handle cases like:
      if (childTag === 'Label')
      if (childTag === 'Description')
      if (childTag === 'ResponseParam')
    */

    if (isBlockTag(childTag)) {
      const component = COMPONENT_MAP[childTag];
      const blueprint = component.blueprint;

      // Assign predictable IDs based on block type (if not already set)
      if (!childAttrs.id) {
        let defaultId;
        if (blueprint.isGrader) {
          defaultId = `${id}_grader_${graderIndex++}`;
        } else if (blueprint.getValue) {
          defaultId = `${id}_input_${inputIndex++}`;
        } else {
          defaultId = `${id}_${childTag.toLowerCase()}_${nodeIndex++}`;
        }
        childAttrs.id = defaultId;
      }
      const blockId = reduxId(childAttrs, childAttrs.id);
      childAttrs.id = blockId;  // Update with resolved ID (handles idPrefix)

      // Track grader context
      let mapping = currentGrader;
      if (blueprint.isGrader) {
        mapping = { id: blockId, inputs: [] };
        graders.push(mapping);
      }

      // Track inputs for grader association
      if (blueprint.getValue && currentGrader) {
        currentGrader.inputs.push(blockId);
      }

      // Recurse into ALL children to assign IDs (critical for nested inputs)
      const kids = node[childTag];
      const kidsArray = Array.isArray(kids) ? kids : (kids ? [kids] : []);
      for (let i = 0; i < kidsArray.length; i++) {
        assignIds(kidsArray[i], mapping);
      }

      return { type: 'block', id: blockId };
    }

    // HTML tag - recurse into children for ID assignment
    const kids = node[childTag];
    const kidsArray = Array.isArray(kids) ? kids : [];
    const childKids = [];
    for (const n of kidsArray) {
      const result = assignIds(n, currentGrader);
      if (result) childKids.push(result);
    }
    return { type: 'html', tag: childTag, attributes: childAttrs, id: childAttrs.id, kids: childKids };
  }

  // Phase 2: Parse children (now with IDs already assigned)
  async function parseChild(node) {
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

    if (isBlockTag(childTag)) {
      const blockId = childAttrs.id;  // Already assigned in Phase 1
      const kids = node[childTag];
      const kidsArray = Array.isArray(kids) ? kids : (kids ? [kids] : []);

      // Invoke the block's parser - ID is already in the attributes
      await parseNode(node, kidsArray, 0);

      return { type: 'block', id: blockId };
    }

    // HTML tag - parse children recursively
    const kids = node[childTag];
    const kidsArray = Array.isArray(kids) ? kids : [];
    const childKids = [];
    for (const n of kidsArray) {
      const result = await parseChild(n);
      if (result) childKids.push(result);
    }
    return { type: 'html', tag: childTag, attributes: childAttrs, id: childAttrs.id, kids: childKids };
  }

  // Phase 1: Assign IDs to all descendants (mutates nodes)
  const kidsStructure = [];
  for (const n of rawKids) {
    const result = assignIds(n, null);
    if (result) kidsStructure.push(result);
  }

  // Phase 2: Parse all children (IDs are now in attributes)
  const kidsParsed = [];
  for (const n of rawKids) {
    const result = await parseChild(n);
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

