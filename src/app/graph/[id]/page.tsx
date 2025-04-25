'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

/**
 * Parses the idMap structure into React Flow compatible nodes and edges.
 */
function parseIdMap(idMap) {
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

    // Handle children flexibly
    let childIds = [];
    try {
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          if (child?.id) childIds.push(child.id);
          else if (child?.type === 'xblock' && child.id) childIds.push(child.id);
          else if (child?.type === 'xml' || child?.type === 'text') {
            // not a reference, ignore
          } else {
            issues.push(`Unknown child type/structure in node ${id}: ${JSON.stringify(child)}`);
          }
        }
      } else if (typeof node.children === 'object') {
        for (const val of Object.values(node.children)) {
          if (Array.isArray(val)) {
            for (const v of val) {
              if (typeof v === 'string') childIds.push(v);
            }
          } else if (typeof val === 'string') {
            childIds.push(val);
          } else {
            issues.push(`Unrecognized child structure in node ${id}: ${JSON.stringify(val)}`);
          }
        }
      } else {
        issues.push(`Unknown children format in node ${id}: ${JSON.stringify(node.children)}`);
      }
    } catch (err) {
      issues.push(`Error processing children for node ${id}: ${err.message}`);
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
    });
  }

  return { nodes, edges, issues };
}

function GraphPage() {
  const params = useParams();
  const id = params?.id;

  const [issues, setIssues] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/${id}`);
      const json = await res.json();
      const { nodes, edges, issues } = parseIdMap(json.idMap);
      setIssues(issues);;
      setNodes(nodes);
      setEdges(edges);
    } catch (err) {
      setGraphData({ nodes: [], edges: [], issues: [`Failed to fetch data: ${err.message}`] });
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchData();
  }, [id, fetchData]);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => setSelectedNode(node)}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </div>
      <div style={{ width: '300px', padding: '1rem', borderLeft: '1px solid #ccc', overflowY: 'auto' }}>
        <h3>Node Info</h3>
        {selectedNode ? (
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{JSON.stringify(selectedNode.data, null, 2)}</pre>
        ) : (
          <p>Click a node to inspect</p>
        )}

        <h4>Issues</h4>
        <ul style={{ fontSize: '0.8rem', color: 'darkred' }}>
          {issues.map((issue, idx) => (
            <li key={idx}>{issue}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default GraphPage;
