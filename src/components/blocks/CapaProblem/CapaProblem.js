// src/components/blocks/CapaProblem/CapaProblem.js
import { dev, reduxId } from '@/lib/blocks';
import { isBlockTag } from '@/lib/util';
import { COMPONENT_MAP } from '@/components/componentMap';
import _CapaProblem from './_CapaProblem';

// CapaProblem parser responsibilities:
// 1. Assign predictable IDs to ALL descendant blocks (grader_0, input_0, etc.)
// 2. Track grader-input relationships for auto-wiring the `target` attribute
// 3. Build mixed content structure (blocks + HTML + text) for rendering
//
// IMPORTANT: IDs must be assigned BEFORE calling child parsers because child
// parsers (like blocksParser) call parseNode on their children, and parseNode
// generates hash-based IDs if no ID is in the attributes. By pre-assigning IDs
// to ALL descendant blocks (not just immediate children), we ensure consistent
// IDs scoped to this CapaProblem.
//
// The approach:
// 1. assignIdsAndBuildStructure: Recursively walk ALL descendants, mutate nodes
//    to add IDs, track grader/input relationships, and build the kids structure
// 2. Call parseNode on immediate block children - their parsers cascade to
//    grandchildren, which already have IDs in their attributes
async function capaParser({ id, tag, attributes, provenance, rawParsed, storeEntry, parseNode }) {
  const tagParsed = rawParsed[tag];
  const rawKids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
  let inputIndex = 0;
  let graderIndex = 0;
  let nodeIndex = 0;
  const graders = [];

  // Recursively assign IDs to ALL descendants and build the kids structure.
  // This MUTATES the nodes to add id attributes before any parsing happens.
  // Returns the mixed content structure for CapaProblem's kids.
  function assignIdsAndBuildStructure(node, currentGrader = null) {
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
      for (const kid of kidsArray) {
        assignIdsAndBuildStructure(kid, mapping);
      }

      return { type: 'block', id: blockId };
    }

    // HTML tag - recurse into children for ID assignment and structure building
    const kids = node[childTag];
    const kidsArray = Array.isArray(kids) ? kids : [];
    const childKids = [];
    for (const n of kidsArray) {
      const result = assignIdsAndBuildStructure(n, currentGrader);
      if (result) childKids.push(result);
    }
    return { type: 'html', tag: childTag, attributes: childAttrs, id: childAttrs.id, kids: childKids };
  }

  // Step 1: Assign IDs to all descendants and build kids structure
  const kidsParsed = [];
  for (const n of rawKids) {
    const result = assignIdsAndBuildStructure(n, null);
    if (result) kidsParsed.push(result);
  }

  // Step 2: Call parseNode on immediate block children to trigger their parsers.
  // Child parsers will cascade to grandchildren, which already have IDs assigned.
  for (const n of rawKids) {
    const childTag = Object.keys(n).find(k => ![':@', '#text', '#comment'].includes(k));
    if (childTag && isBlockTag(childTag)) {
      const kids = n[childTag];
      const kidsArray = Array.isArray(kids) ? kids : (kids ? [kids] : []);
      await parseNode(n, kidsArray, 0);
    }
  }

  // Auto-wire grader targets after parsing
  for (const g of graders) {
    if (g.inputs.length > 0) {
      storeEntry(g.id, (existing) => ({
        ...existing,
        attributes: { ...existing.attributes, target: g.inputs.join(',') }
      }));
    }
  }

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

