// src/components/blocks/CapaProblem/_CapaProblem.jsx
'use client';
import React from 'react';
import { renderCompiledKids, render as renderNode } from '@/lib/render';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';

export default function _CapaProblem(props) {
  const { id, kids = [] } = props;

  // First render problem content to populate dynamic OLX DOM (renderedKids)
  const content = renderCompiledKids({ ...props, kids });

  // Then infer grader targets from the now-populated nodeInfo
  const graderIds = inferRelatedNodes(props, {
    selector: n => n.blueprint?.isGrader,
    infer: props.infer,
    targets: props.targets
  });

  // Render-time default controls
  const controls = [];
  if (graderIds.length > 0) {
    const targets = graderIds.join(',');
    controls.push({ id: `${id}_button`, tag: 'ActionButton', attributes: { label: 'Check', targets }, kids: [] });
    controls.push({ id: `${id}_correctness`, tag: 'Correctness', attributes: { targets }, kids: [] });
  }

  const controlsUI = controls.map((node, i) =>
    renderNode({ node, idMap: props.idMap, nodeInfo: props.nodeInfo, componentMap: props.componentMap, idPrefix: props.idPrefix, key: `${node.id}-${i}` })
  );
  return <>{content}{controlsUI}</>;
}
