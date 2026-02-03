// src/components/blocks/SplitPanel/_SplitPanel.jsx
'use client';

import React from 'react';
import Split from 'react-split';
import { useKids } from '@/lib/render';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';

function PaneContent({ props, paneKids }) {
  const { kids } = useKids({ ...props, kids: paneKids });
  return <>{kids}</>;
}

export default function _SplitPanel(props) {
  const { kids = {}, sizes = '50,50' } = props;
  const { dir } = useLocaleAttributes();
  const isRtl = dir === 'rtl';

  // Handle both physical (left/right) and logical (start/end) panes
  // If only start/end are provided, map them based on text direction
  let firstPane = kids.left ?? kids.start ?? [];
  let secondPane = kids.right ?? kids.end ?? [];

  // If both physical and logical are provided, physical takes precedence
  // For logical panes in RTL mode, swap the order
  if (kids.start && kids.end && !kids.left && !kids.right) {
    // Only logical panes provided
    if (isRtl) {
      // In RTL: StartPane goes to the right, EndPane goes to the left
      firstPane = kids.end;
      secondPane = kids.start;
    } else {
      // In LTR: StartPane goes to the left, EndPane goes to the right
      firstPane = kids.start;
      secondPane = kids.end;
    }
  }

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
          <PaneContent props={props} paneKids={firstPane} />
        </div>
        <div className="p-2 overflow-auto flex flex-col h-full">
          <PaneContent props={props} paneKids={secondPane} />
        </div>
      </Split>
    </div>
  );
}
