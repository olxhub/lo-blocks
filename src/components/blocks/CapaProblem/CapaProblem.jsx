import { dev } from '@/lib/blocks';
import { childParser } from '@/lib/olx/parsers';
import { COMPONENT_MAP } from '@/components/componentMap';
import _CapaProblem from './_CapaProblem';

function isXBlockTag(tag) {
  return !!COMPONENT_MAP[tag];
}

const capaParser = childParser(function capaProblemParser({ rawKids, parseNode }) {
  function parseChild(node) {
    if (node['#text'] !== undefined) {
      const text = node['#text'];
      if (text.trim() === '') return null;
      return { type: 'text', text };
    }
    const tag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!tag) return null;
    if (isXBlockTag(tag)) {
      return parseNode(node);
    }
    const attributes = node[':@'] || {};
    const kids = node[tag];
    const childKids = Array.isArray(kids) ? kids.map(parseChild).filter(Boolean) : [];
    return { type: 'html', tag, attributes, id: attributes.id, kids: childKids };
  }
  return rawKids.map(parseChild).filter(Boolean);
});

function collectIds(nodes) {
  let ids = [];
  for (const n of nodes || []) {
    if (!n) continue;
    if (n.type === 'xblock' && n.id) ids.push(n.id);
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
