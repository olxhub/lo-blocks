// src/components/blocks/SplitPanel/_SplitPanel.jsx
'use client';

import React from 'react';
import Split from 'react-split';
import { useKids } from '@/lib/render';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';
import { DisplayError } from '@/lib/util/debug';

function PaneContent({ props, paneKids }) {
  const { kids } = useKids({ ...props, kids: paneKids });
  return <>{kids}</>;
}

/**
 * Validate fatal config errors that prevent any rendering.
 * Returns error object if found, null otherwise.
 */
function getFatalError(kids) {
  const hasStart = Boolean(kids.start);
  const hasEnd = Boolean(kids.end);
  const hasLeft = Boolean(kids.left);
  const hasRight = Boolean(kids.right);
  const hasStartEnd = hasStart || hasEnd;
  const hasLeftRight = hasLeft || hasRight;

  // Can't mix logical and physical panes
  if (hasStartEnd && hasLeftRight) {
    return {
      name: '❌ Mixed Pane Types',
      technical: 'SplitPanel uses either StartPane+EndPane (logical/RTL-aware) OR LeftPane+RightPane (physical), not both. Please choose one style and remove the other.',
    };
  }

  // Must have at least one pane pair
  if (!hasStartEnd && !hasLeftRight) {
    return {
      name: '⚠️ No Panes Defined',
      technical: 'SplitPanel requires either (StartPane + EndPane) or (LeftPane + RightPane). Currently has neither. Please add both panes.',
    };
  }

  return null;
}

function MissingPane({ paneType }) {
  return (
    <DisplayError
      name={`Missing ${paneType}Pane`}
      message={`Add a <${paneType}Pane> element`}
      id={`splitpanel_missing_${paneType.toLowerCase()}`}
    />
  );
}

export default function _SplitPanel(props) {
  const { kids = {}, sizes = '50,50' } = props;
  const { dir } = useLocaleAttributes();
  const isRtl = dir === 'rtl';

  // Check for fatal config errors
  const fatalError = getFatalError(kids);
  if (fatalError) {
    return (
      <DisplayError
        props={props}
        name={fatalError.name}
        message="SplitPanel configuration issue"
        technical={fatalError.technical}
        id="splitpanel_config_error"
      />
    );
  }

  // Determine pane type and render what we have
  const hasStartEnd = Boolean(kids.start || kids.end);

  const firstPane = hasStartEnd
    ? (kids.start || <MissingPane paneType="Start" />)
    : (isRtl ? kids.right : kids.left) || <MissingPane paneType={isRtl ? "Right" : "Left"} />;

  const secondPane = hasStartEnd
    ? (kids.end || <MissingPane paneType="End" />)
    : (isRtl ? kids.left : kids.right) || <MissingPane paneType={isRtl ? "Left" : "Right"} />;

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
