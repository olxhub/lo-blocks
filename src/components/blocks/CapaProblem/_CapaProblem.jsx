// src/components/blocks/CapaProblem/_CapaProblem.jsx
'use client';
import React, { useEffect } from 'react';
import { CORRECTNESS, aggregateCorrectness } from '@/lib/blocks';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import * as state from '@/lib/state';
import { renderCompiledKids } from '@/lib/render';
import { renderBlock } from '@/lib/renderHelpers';
import { DisplayError } from '@/lib/util/debug';

export default function _CapaProblem(props) {
  const { id, kids = [], fields } = props;

  // First render problem content to populate dynamic OLX DOM (renderedKids)
  const content = renderCompiledKids({ ...props, kids });

  // Find child graders (not self - we search kids only to avoid finding parent CapaProblems)
  const childGraderIds = inferRelatedNodes(props, {
    selector: n => n.blueprint?.isGrader && n.node?.id !== id,
    infer: ['kids'],
    targets: props.target
  });

  // For rendering header/footer, we don't pass target - they'll find CapaProblem as their grader
  const headerNode = renderBlock(props, 'Correctness', { id: `${id}_header_status` });
  const footerNode = renderBlock(props, 'CapaButton', { id: `${id}_footer_controls`, target: childGraderIds.join(',') });

  const title = props.title || props.displayName || props.id || 'Problem';

  // Aggregate correctness from all child graders
  // Note: We need a valid field even if empty to satisfy hook rules
  const hasChildGraders = childGraderIds.length > 0;
  const sampleGraderId = childGraderIds[0] || id; // Use own id as fallback for field lookup

  const correctField = state.componentFieldByName(props, sampleGraderId, 'correct');
  const childCorrectnessValues = state.useAggregate(
    props,
    correctField,
    hasChildGraders ? childGraderIds : [],
    {
      fallback: CORRECTNESS.UNSUBMITTED,
      aggregate: (values) => values.map(v => v?.correct ?? v ?? CORRECTNESS.UNSUBMITTED)
    }
  );

  const correctness = hasChildGraders
    ? aggregateCorrectness(childCorrectnessValues)
    : CORRECTNESS.UNSUBMITTED;

  // Aggregate messages from child graders (combine non-empty messages)
  const messageField = state.componentFieldByName(props, sampleGraderId, 'message');
  const childMessages = state.useAggregate(
    props,
    messageField,
    hasChildGraders ? childGraderIds : [],
    {
      fallback: '',
      aggregate: (values) => values.map(v => v?.message ?? v ?? '')
    }
  );
  const message = childMessages.filter(m => m).join(' ');

  // Update CapaProblem's own fields with aggregated values
  useEffect(() => {
    if (fields?.correct) {
      state.updateReduxField(props, fields.correct, correctness);
    }
  }, [correctness, props.id, fields]);

  useEffect(() => {
    if (fields?.message) {
      state.updateReduxField(props, fields.message, message);
    }
  }, [message, props.id, fields]);

  // No child graders is valid if this is a display-only problem or a survey
  // But typically we want at least one grader
  if (childGraderIds.length === 0 && !props.allowEmpty) {
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

  const headerStateClass =
    correctness === CORRECTNESS.CORRECT ? 'lo-problem__header--correct' :
    correctness === CORRECTNESS.PARTIALLY_CORRECT ? 'lo-problem__header--partial' :
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
