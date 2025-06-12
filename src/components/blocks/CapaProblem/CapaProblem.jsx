import { dev, reduxId, isBlockTag } from '@/lib/blocks';
import { childParser } from '@/lib/olx/parsers';
import { COMPONENT_MAP } from '@/components/componentMap';
import _CapaProblem from './_CapaProblem';

const capaParser = childParser(function capaProblemParser({ rawKids, storeEntry, provenance, id }) {
  let inputIndex = 0;
  let graderIndex = 0;
  let nodeIndex = 0;
  const graders = [];

  function parseChild(node, currentGrader = null) {
    if (node['#text'] !== undefined) {
      const text = node['#text'];
      if (text.trim() === '') return null;
      return { type: 'text', text };
    }
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;
    const attributes = node[':@'] || {};
    const kids = node[tag];

    if (tag === 'Label') {
      const childKids = Array.isArray(kids) ? kids.map(n => parseChild(n, currentGrader)).filter(Boolean) : [];
      return { type: 'html', tag: 'h1', attributes, kids: childKids };
    }
    if (tag === 'Description') {
      const childKids = Array.isArray(kids) ? kids.map(n => parseChild(n, currentGrader)).filter(Boolean) : [];
      return { type: 'html', tag: 'h3', attributes, kids: childKids };
    }

    if (isBlockTag(tag)) {
      const spec = COMPONENT_MAP[tag]?.spec;
      let defaultId;
      if (spec?.isGrader) {
        defaultId = `${id}_grader_${graderIndex++}`;
      } else if (spec?.getValue) {
        defaultId = `${id}_input_${inputIndex++}`;
      } else {
        defaultId = `${id}_${tag.toLowerCase()}_${nodeIndex++}`;
      }
      const blockId = reduxId(attributes, defaultId);

      const entry = { id: blockId, tag, attributes: { ...attributes, id: blockId }, provenance, rawParsed: node };
      // Parse children with new grader context if needed
      let mapping = currentGrader;
      if (spec?.isGrader) {
        mapping = { id: blockId, entry, inputs: [] };
        graders.push(mapping);
      }
      entry.kids = Array.isArray(kids)
        ? kids.map(n => parseChild(n, mapping)).filter(Boolean)
        : [];
      if (spec?.getValue && currentGrader) {
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

  const graderIds = graders.map(g => g.id);
  if (graderIds.length > 0) {
    const buttonId = `${id}_button`;
    storeEntry(buttonId, {
      id: buttonId,
      tag: 'ActionButton',
      attributes: { label: 'Check', targets: graderIds.join(',') },
      provenance,
      rawParsed: {},
      kids: []
    });
    kidsParsed.push({ type: 'block', id: buttonId });

    const correctnessId = `${id}_correctness`;
    storeEntry(correctnessId, {
      id: correctnessId,
      tag: 'Correctness',
      attributes: { targets: graderIds.join(',') },
      provenance,
      rawParsed: {},
      kids: []
    });
    kidsParsed.push({ type: 'block', id: correctnessId });
  }

  return kidsParsed;
});

function collectIds(nodes) {
  let ids = [];
  for (const n of nodes || []) {
    if (!n) continue;
    if (n.type === 'block' && n.id) ids.push(n.id);
    if (n.type === 'html') ids = ids.concat(collectIds(n.kids));
  }
  return ids;
}

capaParser.staticKids = entry => collectIds(entry.kids);

const CapaProblem = dev({
  ...capaParser,
  name: 'CapaProblem',
  component: _CapaProblem
});

export default CapaProblem;
