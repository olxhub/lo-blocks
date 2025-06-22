// src/lib/graph/buildDag.ts
import { parseIdMap } from './parseIdMap';

export interface DagInfo {
  roots: string[];
  childMap: Record<string, string[]>;
  issues: string[];
}

export function buildDag(idMap: Record<string, any>): DagInfo {
  const { nodes, edges, issues } = parseIdMap(idMap);
  const childMap: Record<string, string[]> = {};
  const incoming = new Set<string>();

  for (const { source, target } of edges) {
    if (!childMap[source]) childMap[source] = [];
    childMap[source].push(target);
    incoming.add(target);
  }

  const roots = nodes
    .filter(n => !incoming.has(n.id))
    .map(n => n.id);

  return { roots, childMap, issues };
}
