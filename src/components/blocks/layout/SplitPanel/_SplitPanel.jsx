// src/components/blocks/SplitPanel/_SplitPanel.jsx
'use client';

import React from 'react';
import Split from 'react-split';
import { useKids } from '@/lib/render';

function PaneContent({ props, paneKids }) {
  const { kids } = useKids({ ...props, kids: paneKids });
  return <>{kids}</>;
}

export default function _SplitPanel(props) {
  const { kids = {}, sizes = '50,50' } = props;
  const left = kids.left ?? [];
  const right = kids.right ?? [];

  const parsedSizes = sizes
    .split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n));
  const splitSizes = parsedSizes.length === 2 ? parsedSizes : [50, 50];

  return (
    <div className="h-full w-full">
      <Split
        className="flex h-full"
        sizes={splitSizes}
        minSize={100}
        gutterSize={6}
        direction="horizontal"
        style={{ display: 'flex' }}
      >
        <div className="p-2 overflow-auto flex flex-col h-full">
          <PaneContent props={props} paneKids={left} />
        </div>
        <div className="p-2 overflow-auto flex flex-col h-full">
          <PaneContent props={props} paneKids={right} />
        </div>
      </Split>
    </div>
  );
}
