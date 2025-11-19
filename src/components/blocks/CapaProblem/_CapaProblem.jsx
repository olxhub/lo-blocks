// src/components/blocks/CapaProblem/_CapaProblem.jsx
'use client';
import React from 'react';
import { CORRECTNESS } from '@/lib/blocks';
import * as state from '@/lib/state';
import { renderCompiledKids } from '@/lib/render';
import { renderBlock } from '@/lib/renderHelpers';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { DisplayError } from '@/lib/util/debug';

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

  if (graderIds.length === 0) {
    return (
      <DisplayError
        props={props}
        id={`${id}_no_grader`}
        name="CapaProblem"
        message="No grader found. Add a grader block (e.g., NumericalGrader, RatioGrader) to this problem."
        technical={{ hint: 'CapaProblem expects at least one child block with isGrader=true' }}
      />
    );
  }

  const targets = graderIds.join(',');
  const headerNode = renderBlock(props, 'Correctness', { id: `${id}_header_status`, targets });
  const footerNode = renderBlock(props, 'CapaButton', { id: `${id}_footer_controls`, targets, label: props.submitLabel });

  const title = props.title || props.displayName || props.id || 'Problem';

  // Compute header color based on correctness of first grader (via state hooks)
  const firstGraderId = graderIds[0];
  let correctness = CORRECTNESS.UNSUBMITTED;
  if (firstGraderId) {
    try {
      const correctField = state.componentFieldByName(props, firstGraderId, 'correct');
      correctness = state.useFieldSelector(
        props,
        correctField,
        { id: firstGraderId, fallback: CORRECTNESS.UNSUBMITTED, selector: s => s?.correct }
      );
      if (correctness == null) correctness = CORRECTNESS.UNSUBMITTED;
    } catch (e) {
      // If field not available, default to UNSUBMITTED
      correctness = CORRECTNESS.UNSUBMITTED;
    }
  }
  const headerStateClass =
    correctness === CORRECTNESS.CORRECT ? 'lo-problem__header--correct' :
    correctness === CORRECTNESS.INVALID ? 'lo-problem__header--invalid' :
    correctness === CORRECTNESS.INCORRECT ? 'lo-problem__header--incorrect' :
    '';

  return (
    <div className="lo-problem">
      <div className={`lo-problem__header ${headerStateClass}`}>
        <div className="lo-problem__title">{title}</div>
        <div className="lo-problem__status">{headerNode}</div>
      </div>
      <div className="lo-problem__content">
        {content}
      </div>
      <div className="lo-problem__footer">
        <div className="lo-problem__actions">{footerNode}</div>
      </div>
    </div>
  );
}
