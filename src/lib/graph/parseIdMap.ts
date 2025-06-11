import { COMPONENT_MAP } from '@/components/componentMap';

/**
 * Parses the idMap structure into React Flow compatible nodes and edges.
 */
export function parseIdMap(idMap) {
  const nodes = [];
  const edges = [];
  const issues = [];
  const incomingCount = new Map();

  for (const [id, node] of Object.entries(idMap)) {
    let label = node.tag;
    if (!label) {
      label = '(no tag)';
      issues.push(`Node ${id} missing tag`);
    }

    let childIds = [];
    const comp = COMPONENT_MAP[node.tag];
    try {
      if (comp && typeof comp.staticKids === 'function') {
        childIds = comp.staticKids(node) || [];
      } else if (Array.isArray(node.kids)) {
        childIds = node.kids
          .map(k => (typeof k === 'string' ? k : k?.id))
          .filter(Boolean);
      } else if (node.kids && typeof node.kids === 'object') {
        for (const val of Object.values(node.kids)) {
          const arr = Array.isArray(val) ? val : [val];
          for (const v of arr) {
            const ref = typeof v === 'string' ? v : v?.id;
            if (ref) childIds.push(ref);
          }
        }
      }
    } catch (err) {
      issues.push(`Error processing kids for node ${id}: ${err.message}`);
    }

    // Track incoming refs
    for (const childId of childIds) {
      incomingCount.set(childId, (incomingCount.get(childId) || 0) + 1);
      edges.push({ id: `${id}->${childId}`, source: id, target: childId });
    }

    nodes.push({
      id,
      data: {
        label: `${label}\n(${id})`,
        attributes: node.attributes || {},
        tag: node.tag,
      },
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      type: 'custom'
    });
  }

  return { nodes, edges, issues };
}
