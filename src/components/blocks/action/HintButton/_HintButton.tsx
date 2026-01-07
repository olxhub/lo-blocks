// src/components/blocks/action/HintButton/_HintButton.jsx
'use client';

import React, { useMemo, useCallback } from 'react';
import * as state from '@/lib/state';
import { getAllNodes } from '@/lib/blocks/olxdom';
import { DisplayError } from '@/lib/util/debug';
import * as DemandHints from '@/components/blocks/display/DemandHints/DemandHints';

/**
 * Find DemandHints component in the OLX DOM.
 * Searches for a component with name 'DemandHints'.
 */
function findDemandHints(props) {
  const { target, nodeInfo, idMap, blockRegistry } = props;

  // If explicit target, use that
  if (target) {
    return target;
  }

  // Search for DemandHints in the tree
  if (!nodeInfo) return null;

  const hintsNodes = getAllNodes(nodeInfo, {
    selector: (n) => n.loBlock.name === 'DemandHints'
  });

  return hintsNodes.length > 0 ? hintsNodes[0].node?.id : null;
}

export default function _HintButton(props) {
  const { id } = props;

  // Find target DemandHints component
  const { target, nodeInfo, idMap, blockRegistry } = props;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when target or nodeInfo changes
  const hintsId = useMemo(() => findDemandHints(props), [target, nodeInfo]);

  // Get hint count from DemandHints blueprint
  const hintCount = useMemo(() => {
    if (!hintsId) return 0;
    const hintsNode = idMap?.[hintsId];
    const hintsBlueprint = hintsNode ? blockRegistry?.[hintsNode.tag] : null;
    if (hintsBlueprint?.locals?.getHintCount) {
      const hintsProps = {
        ...props,
        id: hintsId,
        ...hintsNode?.attributes,
        kids: hintsNode?.kids
      };
      return hintsBlueprint.locals.getHintCount(hintsProps);
    }
    return 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when hintsId or maps change
  }, [hintsId, idMap, blockRegistry]);

  // Read/write hintsRevealed field on the DemandHints component
  // Use the field definition from DemandHints directly (avoids null field issue)
  const [hintsRevealed, setHintsRevealed] = state.useReduxState(
    props,
    DemandHints.fields.hintsRevealed,
    0,
    { id: hintsId || id }
  );

  const handleClick = useCallback(() => {
    if (hintsRevealed < hintCount) {
      setHintsRevealed(hintsRevealed + 1);
    }
  }, [hintsRevealed, hintCount, setHintsRevealed]);

  // Error if no DemandHints found
  if (!hintsId) {
    return (
      <DisplayError
        props={props}
        name="HintButton"
        message="No DemandHints component found"
        technical="Add target='hints_id' or place a DemandHints component in the same problem."
      />
    );
  }

  // Don't show button if no hints available
  if (hintCount === 0) {
    return null;
  }

  const allRevealed = hintsRevealed >= hintCount;
  const remaining = hintCount - hintsRevealed;

  return (
    <button
      className={`lo-hint-button ${allRevealed ? 'lo-hint-button--exhausted' : ''}`}
      onClick={handleClick}
      disabled={allRevealed}
    >
      {allRevealed
        ? 'No more hints'
        : `Hint (${remaining} left)`
      }
    </button>
  );
}
