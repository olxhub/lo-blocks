// packages/shared/components/blocks/CapaProblem/_CapaProblem.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import React from 'react';
import { correctness } from '@/lib/blocks';
import { inferRelatedNodes } from '@/lib/blocks/olxdom';
import { useCorrectness } from '@/lib/grading';
import { useKids, Block } from '@/lib/render';
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

function noGraderTechnicalDetails(props: RuntimeProps, childGraderIds: string[]) {
  const node = props.nodeInfo?.olxJson;
  return {
    hint: 'CapaProblem expects at least one child block with isGrader=true',
    id: props.id,
    title: props.title,
    tag: node?.tag,
    stateKey: props.nodeInfo?.stateKey,
    source: node?.source,
    parseDeps: node?.parseDeps,
    sourceOffset: node?._sourceOffset,
    childGraderIds,
    consoleHint: 'Raw props.kids and props.nodeInfo.renderedKids are logged in this DisplayError data payload.',
  };
}

function noGraderDebugData(props: RuntimeProps) {
  return {
    kids: props.kids,
    renderedKids: props.nodeInfo?.renderedKids,
  };
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

export default function CapaProblem(props: RuntimeProps) {
  const { id } = props;

  // grade="immediate" is designed (derived correctness via selectors —
  // lib/grading/useCorrectness.ts) but not yet enabled; fail loudly rather
  // than silently behaving like submit mode.
  if (props.grade === 'immediate') {
    return (
      <DisplayError
        props={props}
        id={`${id}_grade_mode`}
        title="CapaProblem"
        message={`grade="immediate" is not yet supported (problem "${id}"). Remove the grade attribute (or use grade="submit") until immediate grading is enabled.`}
      />
    );
  }

  // Render content first to populate dynamic OLX DOM
  const { kids: content } = useKids(props);

  // Find child graders and DemandHints
  const childGraderIds = findChildGraderIds(props);
  const hintsId = findDemandHintsId(props);

  // Grading state is DERIVED (never stored): useCorrectness aggregates the
  // child graders' stored fields on read. See lib/grading/useCorrectness.ts.
  const { correct: problemCorrectness, submitCount } = useCorrectness(props, props.nodeInfo?.stateKey);

  // Validate: require at least one grader unless explicitly allowed
  if (childGraderIds.length === 0 && !props.allowEmpty) {
    return (
      <DisplayError
        props={props}
        id={`${id}_no_grader`}
        title="CapaProblem"
        message={`No grader found in CapaProblem "${id}". Add a grader block (e.g., NumericalGrader, KeyGrader) to this problem.`}
        technical={noGraderTechnicalDetails(props, childGraderIds)}
        data={noGraderDebugData(props)}
      />
    );
  }

  // Build header/footer nodes (they find CapaProblem via parent inference)
  const title = props.title || props.displayName || props.id || 'Problem';
  const headerNode = <Block props={props} tag="Correctness" id={`${id}_header_status`} />;
  const footerNode = (
    <Block props={props} tag="CapaFooter"
      id={`${id}_footer_controls`}
      target={childGraderIds.join(',')}
      hintsTarget={hintsId}
      // Author override for the button label; falls back to computed Check/Submit.
      label={props.submitLabel}
      // Problem mode settings
      maxAttempts={props.maxAttempts}
      showanswer={props.showanswer}
      submitCount={submitCount}
      correct={problemCorrectness}
    />
  );

  return (
    <div className="lo-problem">
      <CapaHeader title={title} correctness={problemCorrectness} headerNode={headerNode} />
      <CapaContent>{content}</CapaContent>
      <FooterWrapper>{footerNode}</FooterWrapper>
    </div>
  );
}
