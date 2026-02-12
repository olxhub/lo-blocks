// src/components/blocks/CapaProblem/_CapaProblem.jsx
'use client';
import React, { useEffect } from 'react';
import { correctness, worstCaseCorrectness } from '@/lib/blocks';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import * as state from '@/lib/state';
import { useKids, renderBlock } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

// --- Logic Functions ---

/**
 * Find child grader IDs within this CapaProblem.
 * Excludes self to avoid finding parent CapaProblems in nested structures.
 */
function findChildGraderIds(props) {
  const { id, target } = props;
  return inferRelatedNodes(props, {
    selector: n => n.loBlock.isGrader && n.olxJson.id !== id,
    infer: ['kids'],
    targets: target
  });
}

/**
 * Find DemandHints ID within this CapaProblem (if any).
 */
function findDemandHintsId(props) {
  const ids = inferRelatedNodes(props, {
    selector: n => n.loBlock.name === 'DemandHints',
    infer: ['kids']
  });
  return ids.length > 0 ? ids[0] : null;
}

/**
 * Map correctness value to CSS modifier class.
 */
function getHeaderStateClass(correctnessValue: string) {
  switch (correctnessValue) {
    case correctness.correct: return 'lo-problem__header--correct';
    case correctness.partiallyCorrect: return 'lo-problem__header--partial';
    case correctness.invalid: return 'lo-problem__header--invalid';
    case correctness.incorrect: return 'lo-problem__header--incorrect';
    default: return '';
  }
}

// --- Hooks ---

/**
 * Aggregate correctness and messages from child graders.
 * Updates CapaProblem's own fields with aggregated values.
 *
 * TODO: Multipart problem aggregation needs work. Current issues:
 * - Messages are joined with spaces, so feedback from one part floats to the footer
 *   disconnected from its question (e.g., "Correct! Bandura's..." appears at bottom)
 * - No way to know which part the feedback belongs to
 * - Same issue affects demand hints - unclear which question hints apply to
 * - "Show Answer" displays answers inline but feedback aggregates to footer
 *
 * Possible fixes:
 * 1. Show feedback inline with each grader, footer only shows aggregate status
 * 2. Prefix messages with question context: "Q3: Correct! Bandura's..."
 * 3. Don't aggregate messages for multipart - just show correctness
 *
 * Note: Multipart problems are pedagogically tricky anyway - if student gets one
 * part wrong, there's no clear way to identify which part or see the right answer.
 * Checkbox and text input problems have similar issues. See MarkupProblemMultipart.olx.
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
      fallback: correctness.unsubmitted,
      aggregate: (values) => values.map(v => v ?? correctness.unsubmitted)
    }
  );

  const aggregatedCorrectness = hasChildGraders
    ? worstCaseCorrectness(childCorrectnessValues)
    : correctness.unsubmitted;

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

  // Subscribe to child grader submitCounts - sum them for flash animation
  // TODO: Wire this more cleanly?
  const submitCountField = state.componentFieldByName(props, sampleGraderId, 'submitCount');
  const childSubmitCounts = state.useAggregate(
    props,
    submitCountField,
    hasChildGraders ? childGraderIds : [],
    {
      fallback: 0,
      aggregate: (values) => values.map(v => v ?? 0)
    }
  );
  const totalSubmitCount = Math.max(...childSubmitCounts, 0);

  // Update CapaProblem's own fields with aggregated values
  // props object changes on every render, only re-run when values change
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (fields?.correct) {
      state.updateField(props, fields.correct, aggregatedCorrectness);
    }
  }, [aggregatedCorrectness, props.id, fields]);

  useEffect(() => {
    if (fields?.message) {
      state.updateField(props, fields.message, message);
    }
  }, [message, props.id, fields]);

  useEffect(() => {
    if (fields?.submitCount) {
      state.updateField(props, fields.submitCount, totalSubmitCount);
    }
  }, [totalSubmitCount, props.id, fields]);
  /* eslint-enable react-hooks/exhaustive-deps */

  return { correctness: aggregatedCorrectness, message, submitCount: totalSubmitCount };
}

// --- Presentation Components ---

function CapaHeader({ title, correctness: correctnessValue, headerNode }) {
  const stateClass = getHeaderStateClass(correctnessValue);
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
  const { id } = props;

  // Render content first to populate dynamic OLX DOM
  const { kids: content } = useKids(props);

  // Find child graders and DemandHints
  const childGraderIds = findChildGraderIds(props);
  const hintsId = findDemandHintsId(props);

  // Aggregate state from child graders
  const { correctness, submitCount } = useGraderAggregation(props, childGraderIds);

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
    hintsTarget: hintsId,
    // Problem mode settings
    maxAttempts: props.maxAttempts,
    showanswer: props.showanswer,
    submitCount,
    correct: correctness,
  });

  return (
    <div className="lo-problem">
      <CapaHeader title={title} correctness={correctness} headerNode={headerNode} />
      <CapaContent>{content}</CapaContent>
      <FooterWrapper>{footerNode}</FooterWrapper>
    </div>
  );
}
