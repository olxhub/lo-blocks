// src/components/blocks/CapaProblem/CapaProblem.js
import { dev, reduxId } from '@/lib/blocks';
import { isBlockTag } from '@/lib/util';
import { COMPONENT_MAP } from '@/components/componentMap';
import _CapaProblem from './_CapaProblem';

// TODO: Make this parser generic to CapaProblem, HTML, and others
//
// This is a minimal working version. This code should not be treated as clean or canonical.
function capaParser({ id, tag, attributes, provenance, rawParsed, storeEntry }) {
  const tagParsed = rawParsed[tag];
  const rawKids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
  let inputIndex = 0;
  let graderIndex = 0;
  let nodeIndex = 0;
  const graders = [];

  /* BUG: This is incorrect.
     When CapaProblem encounters text content inside a block (like TextBlock), it wraps it in { type:
    'text', text: "..." } instead of letting the block's own parser handle it.

    The issue is that when CapaProblem sees <TextBlock>Venus</TextBlock>, it:
    1. Recognizes TextBlock as a block tag
    2. Parses the children ("Venus") with parseChild
    3. parseChild sees text and wraps it as { type: 'text', text: 'Venus' }
    4. This wrapped object becomes the kids for TextBlock

    But TextBlock has its own text() parser that should be handling
    this text content directly.

    This is not a trivial fix, since we extract a lot of information
    at parse time, rather than dynamically from the OLX DOM.  That's a
    problem for other reasons too.
  */
  function parseChild(node, currentGrader = null) {
    if (node['#text'] !== undefined) {
      const text = node['#text'];
      if (text.trim() === '') return null;
      return { type: 'text', text };
    }
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;
    const attributes = node[':@'] ?? {};
    const kids = node[tag];

    /* TODO: from Open edX OLX, we need to handle cases like:
      if (tag === 'Label')
      if (tag === 'Description')
      if (tag === 'ResponseParam')
    */

    if (isBlockTag(tag)) {
      const blueprint = COMPONENT_MAP[tag]?.blueprint;
      let defaultId;
      // TODO: These should not be special cases, but data
      // As is, we can't reuse this for an HTML component
      if (blueprint?.isGrader) {
        defaultId = `${id}_grader_${graderIndex++}`;
      } else if (blueprint?.getValue) {
        // TODO: Probably we should map input IDs to grader IDs. e.g.:
        // [problem_id]_input_[grader_idx]_[input_idx]
        defaultId = `${id}_input_${inputIndex++}`;
      } else {
        defaultId = `${id}_${tag.toLowerCase()}_${nodeIndex++}`;
      }
      const blockId = reduxId(attributes, defaultId);

      // TODO: DRY. I'm not sure if we want to replicate how we find related graders, etc.
      //
      // We should probably be using inferRelatedNodes
      const entry = { id: blockId, tag, attributes: { ...attributes, id: blockId }, provenance, rawParsed: node };
      // Parse children with new grader context if needed
      let mapping = currentGrader;
      if (blueprint?.isGrader) {
        mapping = { id: blockId, entry, inputs: [] };
        graders.push(mapping);
      }
      entry.kids = Array.isArray(kids)
        ? kids.map(n => parseChild(n, mapping)).filter(Boolean)
        : [];
      if (blueprint?.getValue && currentGrader) {
        currentGrader.inputs.push(blockId);
      }

      storeEntry(blockId, entry);
      return { type: 'block', id: blockId };
    }

    const childKids = Array.isArray(kids) ? kids.map(n => parseChild(n, currentGrader)).filter(Boolean) : [];
    return { type: 'html', tag, attributes, id: attributes.id, kids: childKids };
  }
  const kidsParsed = rawKids.map(n => parseChild(n, null)).filter(Boolean);

  graders.forEach(g => {
    if (g.inputs.length > 0) {
      g.entry.attributes.targets = g.inputs.join(',');
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

