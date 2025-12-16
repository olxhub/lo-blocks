// src/components/blocks/CapaProblem/_CapaProblem.jsx
'use client';
import React, { useEffect } from 'react';
import { CORRECTNESS, worstCaseCorrectness } from '@/lib/blocks';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import * as state from '@/lib/state';
import { renderCompiledKids } from '@/lib/render';
import { renderBlock } from '@/lib/renderHelpers';
import { DisplayError } from '@/lib/util/debug';

// --- Logic Functions ---

/**
 * Find child grader IDs within this CapaProblem.
 * Excludes self to avoid finding parent CapaProblems in nested structures.
 */
function findChildGraderIds(props) {
  const { id, target } = props;
  return inferRelatedNodes(props, {
    selector: n => n.blueprint?.isGrader && n.node?.id !== id,
    infer: ['kids'],
    targets: target
  });
}

/**
 * Find DemandHints ID within this CapaProblem (if any).
 */
function findDemandHintsId(props) {
  const ids = inferRelatedNodes(props, {
    selector: n => n.blueprint?.name === 'DemandHints',
    infer: ['kids']
  });
  return ids.length > 0 ? ids[0] : null;
}

/**
 * Map CORRECTNESS to CSS modifier class.
 */
function getHeaderStateClass(correctness) {
  switch (correctness) {
    case CORRECTNESS.CORRECT: return 'lo-problem__header--correct';
    case CORRECTNESS.PARTIALLY_CORRECT: return 'lo-problem__header--partial';
    case CORRECTNESS.INVALID: return 'lo-problem__header--invalid';
    case CORRECTNESS.INCORRECT: return 'lo-problem__header--incorrect';
    default: return '';
  }
}

// --- Hooks ---

/**
 * Aggregate correctness and messages from child graders.
 * Updates CapaProblem's own fields with aggregated values.
 */
function useGraderAggregation(props, childGraderIds) {
  const { id, fields } = props;
  const hasChildGraders = childGraderIds.length > 0;
  const sampleGraderId = childGraderIds[0] || id;

  // Subscribe to child grader correctness values
  const correctField = state.componentFieldByName(props, sampleGraderId, 'correct');
  const childCorrectnessValues = state.useAggregate(
    props,
    correctField,
    hasChildGraders ? childGraderIds : [],
    {
      fallback: CORRECTNESS.UNSUBMITTED,
      aggregate: (values) => values.map(v => v ?? CORRECTNESS.UNSUBMITTED)
    }
  );

  const correctness = hasChildGraders
    ? worstCaseCorrectness(childCorrectnessValues)
    : CORRECTNESS.UNSUBMITTED;

  // Subscribe to child grader messages
  const messageField = state.componentFieldByName(props, sampleGraderId, 'message');
  const childMessages = state.useAggregate(
    props,
    messageField,
    hasChildGraders ? childGraderIds : [],
    {
      fallback: '',
      aggregate: (values) => values.map(v => v ?? '')
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

  return { correctness, message };
}

// --- Presentation Components ---

function CapaHeader({ title, correctness, headerNode }) {
  const stateClass = getHeaderStateClass(correctness);
  return (
    <div className={`lo-problem__header ${stateClass}`}>
      <div className="lo-problem__title">{title}</div>
      <div className="lo-problem__status">{headerNode}</div>
    </div>
  );
}

function CapaContent({ children }) {
  return (
    <div className="lo-problem__content">
      {children}
    </div>
  );
}

function FooterWrapper({ children }) {
  return (
    <div className="lo-problem__footer">
      <div className="lo-problem__actions">{children}</div>
    </div>
  );
}

// --- Main Component ---

export default function _CapaProblem(props) {
  const { id, kids = [] } = props;

  // Render content first to populate dynamic OLX DOM
  const content = renderCompiledKids({ ...props, kids });

  // Find child graders and DemandHints
  const childGraderIds = findChildGraderIds(props);
  const hintsId = findDemandHintsId(props);

  // Aggregate state from child graders
  const { correctness } = useGraderAggregation(props, childGraderIds);

  // Validate: require at least one grader unless explicitly allowed
  if (childGraderIds.length === 0 && !props.allowEmpty) {
    return (
      <DisplayError
        props={props}
        id={`${id}_no_grader`}
        name="CapaProblem"
        message="No grader found. Add a grader block (e.g., NumericalGrader, KeyGrader) to this problem."
        technical={{ hint: 'CapaProblem expects at least one child block with isGrader=true' }}
      />
    );
  }

  // Build header/footer nodes (they find CapaProblem via parent inference)
  const title = props.title || props.displayName || props.id || 'Problem';
  const headerNode = renderBlock(props, 'Correctness', { id: `${id}_header_status` });
  const footerNode = renderBlock(props, 'CapaFooter', {
    id: `${id}_footer_controls`,
    target: childGraderIds.join(','),
    hintsTarget: hintsId
  });

  return (
    <div className="lo-problem">
      <CapaHeader title={title} correctness={correctness} headerNode={headerNode} />
      <CapaContent>{content}</CapaContent>
      <FooterWrapper>{footerNode}</FooterWrapper>
    </div>
  );
}
