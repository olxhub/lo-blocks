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
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import dagre from 'dagre';
import { COMPONENT_MAP } from '@/components/componentMap';
import { parseIdMap } from '@/lib/graph/parseIdMap';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 180;
const nodeHeight = 80;

function layoutElements(nodes, edges, direction = 'TB') {
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = { x: nodeWithPosition.x - nodeWidth / 2, y: nodeWithPosition.y - nodeHeight / 2 };
    return node;
  });
}

function CustomNode({ data, id }) {
  const MAX_ID_LENGTH = 20;

  const shortId = id.length > MAX_ID_LENGTH
    ? id.slice(0, MAX_ID_LENGTH) + '…'
    : id;

  return (
    <div style={{
      padding: 10,
      border: '1px solid #ddd',
      borderRadius: 8,
      background: 'white',
      fontSize: '0.7rem',
      width: 180
    }}>
      <div style={{ fontWeight: 'bold', fontSize: '0.75rem', wordBreak: 'break-word' }}>
        {shortId}
      </div>
      <div style={{ color: '#666', fontSize: '0.7rem', marginBottom: 4 }}>
        {data.tag || '(no tag)'}
      </div>
      <div style={{ fontSize: '0.65rem', color: '#333' }}>
        {Object.entries(data.attributes || {}).map(([key, value]) => (
          <div key={key}>
            <strong>{key}</strong>: {value}
          </div>
        ))}
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
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
      const laidOutNodes = layoutElements(nodes, edges, 'TB');
      setIssues(issues);
      setNodes(laidOutNodes);
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
          nodeTypes={{ custom: CustomNode }}
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
