// src/lib/graph/parseIdMap.ts
//
// Graph visualization - converts Learning Observer content into visual node graphs.
//
// Transforms the idMap content structure into React Flow compatible nodes and edges
// for visualizing learning content as an interactive graph. Extracts parent-child
// relationships from block staticKids and identifies launchable entry points.
//
// Currently used for debugging content structure and relationships in DAG-based content.
//
import { COMPONENT_MAP } from '@/components/componentMap';
import { GraphNode, GraphEdge, ParseError } from '@/lib/types';

interface ParseResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  issues: ParseError[];
  launchable: string[];
}

/**
 * Parses the idMap structure into React Flow compatible nodes and edges.
 *
 * TODO: Remove duplicate IDs
 */
export function parseIdMap(idMap: Record<string, any>): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const launchable: string[] = [];

  // Issues found during graph parsing - these should be surfaced to help debug problems
  const issues = [];

  for (const [id, node] of Object.entries(idMap)) {
    let childIds = [];
    const comp = COMPONENT_MAP[node.tag];

    // Missing components are serious errors - they indicate components that were parsed but aren't registered
    if (!comp) {
      const issue = `No component found for tag: <${node.tag}> (id: ${id}). This suggests the component exists in content but isn't properly registered in COMPONENT_MAP.`;
      console.error(`[parseIdMap] ${issue}`);
      issues.push({ type: 'missing_component', node: id, tag: node.tag, message: issue });
      childIds = [];
    } else if (!comp.staticKids) {
      const issue = `Component ${node.tag} has no staticKids method (id: ${id}). All components should have a staticKids method for graph building.`;
      console.error(`[parseIdMap] ${issue}`);
      issues.push({ type: 'missing_static_kids', node: id, tag: node.tag, message: issue });
      childIds = [];
    } else {
      childIds = comp.staticKids(node);
    }

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
        attributes: node.attributes ?? {},
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
