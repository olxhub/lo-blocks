// src/lib/graph/parseIdMap.ts
import { COMPONENT_MAP } from '@/components/componentMap';

/**
 * Parses the idMap structure into React Flow compatible nodes and edges.
 *
 * TODO: Remove duplicate IDs
 */
export function parseIdMap(idMap) {
  const nodes = [];
  const edges = [];
  const launchable = [];

  // IF something goes wrong, we add it here
  // At present, unused, as nothing is going wrong.
  // We might remove it someday
  const issues = [];

  for (const [id, node] of Object.entries(idMap)) {
    let childIds = [];
    const comp = COMPONENT_MAP[node.tag];
    childIds = comp.staticKids(node);

    // Avoid duplicates
    if(nodes.find(n => n.id === id)) {
      continue;
    }

    // Add edges
    for (const childId of childIds) {
      const edgeId = `${id}->${childId}`;
      if(!edges.find(e => e.id === edgeId)) {
	edges.push({ id: edgeId, source: id, target: childId });
      }
    }

    // Add nodes
    nodes.push({
      id,
      data: {
        label: `${node.tag}\n(${id})`,
        attributes: node.attributes || {},
        tag: node.tag,
	provenance: node.provenance
      },
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      type: 'custom'
    });

    // Include root nodes
    if(node?.attributes?.launchable) {
      launchable.push(id);
    }
  }

  return { nodes, edges, issues, launchable };
}
