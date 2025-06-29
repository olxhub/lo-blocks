// src/components/blocks/SplitPanel/_SplitPanel.jsx
'use client';

import React from 'react';
import Split from 'react-split';
import { render } from '@/lib/render';

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
          {render({ ...props, node: left })}
        </div>
        <div className="p-2 overflow-auto flex flex-col h-full">
          {render({ ...props, node: right })}
        </div>
      </Split>
    </div>
  );
}
