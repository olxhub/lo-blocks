// packages/shared/components/blocks/CapaProblem/_CapaProblem.tsx
'use client';
import type { RuntimeProps, StateKey } from '@/lib/types';
import { correctness } from '@/lib/blocks';
import { inferRelatedNodes } from '@/lib/blocks/dynamicDom';
import { useGradingState, childGraderStateKeys, whenGatedGradingKids } from '@/lib/grading';
import { staticEntryForStateKey, blueprintFor } from '@/lib/blocks/staticDom';
import { useKids, Block } from '@/lib/render';
import { DisplayError } from '@/lib/util/debug';

// --- Logic Functions ---

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

function noGraderTechnicalDetails(props: RuntimeProps, directChildGraderStateKeys: StateKey[]) {
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
    directChildGraderStateKeys,
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

  const isImmediate = props.grade === 'immediate';

  // Render content first to populate dynamic OLX DOM
  const { kids: content } = useKids(props);

  // Boundary-aware static topology: these are the grader instances governed
  // directly by this problem (nested problems own their own descendants).
  const reduxState = props.runtime.store.getState();
  const directChildGraderStateKeys = childGraderStateKeys(
    reduxState,
    props,
    props.nodeInfo.stateKey,
  );
  const hintsId = findDemandHintsId(props);

  // Grading state is DERIVED (never stored): useGradingState aggregates the
  // child graders on read — stored fields in submit mode, live evaluation
  // of input values in immediate mode. See lib/grading/selectGradingState.ts.
  // (The render entrypoint's useBlocksReady gate readies lazy engines before
  // this component renders.)
  const { correct: problemCorrectness, submitCount } = useGradingState(props, props.nodeInfo.stateKey);

  // Slow graders can't grade immediately — there is no submit button to
  // trigger them and no meaningful per-keystroke pending state. Recompute on
  // every immediate-mode render so live edits to a grader's configuration take
  // effect.
  if (isImmediate) {
    const asyncChildGraderStateKeys = directChildGraderStateKeys.filter(stateKey => {
      const entry = staticEntryForStateKey(reduxState, props, stateKey);
      return entry && blueprintFor(props, entry)?.grading?.execution === 'async';
    });
    if (asyncChildGraderStateKeys.length > 0) {
      return (
        <DisplayError
          props={props}
          id={`${id}_grade_mode`}
          title="CapaProblem"
          message={`grade="immediate" cannot be used with async graders (problem "${id}": ${asyncChildGraderStateKeys.join(', ')}). Use grade="submit" for LLM/instructor-graded problems.`}
        />
      );
    }
  }

  // Grader topology is static: when=-hidden graders/inputs still COUNT
  // toward the grade, which is almost never what when= on a grading block
  // intends. Error until someone has a real use case.
  const whenGated = whenGatedGradingKids(reduxState, props, props.nodeInfo.stateKey);
  if (whenGated.length > 0) {
    return (
      <DisplayError
        props={props}
        id={`${id}_when_gated_grading`}
        title="CapaProblem"
        message={`when= on a grader or its input (problem "${id}": ${whenGated.join(', ')}) is probably a bug: `
          + `a problem's grading structure is fixed, so a hidden grader or input still counts toward the grade. `
          + `Use when= on content around the problem, or split into separate problems. `
          + `If you have a use case for visibility-gated grading blocks, email us — we can enable this if it turns out to be usable. But it looks wrong!`}
      />
    );
  }

  // Validate: require at least one grader unless explicitly allowed
  if (directChildGraderStateKeys.length === 0 && !props.allowEmpty) {
    return (
      <DisplayError
        props={props}
        id={`${id}_no_grader`}
        title="CapaProblem"
        message={`No grader found in CapaProblem "${id}". Add a grader block (e.g., NumericalGrader, KeyGrader) to this problem.`}
        technical={noGraderTechnicalDetails(props, directChildGraderStateKeys)}
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
      target={directChildGraderStateKeys.join(',')}
      hintsTarget={hintsId}
      // Author override for the button label; falls back to computed Check/Submit.
      label={props.submitLabel}
      // Problem mode settings
      maxAttempts={props.maxAttempts}
      showanswer={props.showanswer}
      grade={props.grade}
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
