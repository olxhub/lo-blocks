// packages/shared/components/blocks/grading/_GraderShell.tsx
//
// Default renderer for leaf grader blocks. Normally renders just its
// children (question text, inputs) — like _Noop. Inside a grade="immediate"
// problem it also renders an inline per-grader correctness icon: with no
// submit cycle, and worst-case aggregation at the problem level masking
// individual parts, each part needs its own visible status.
//
'use client';
import React, { useEffect, useState } from 'react';
import { useKids, Block } from '@/lib/render';
import { isImmediateContext } from '@/lib/grading';
import type { RuntimeProps } from '@/lib/types';

export default function GraderShell(props: RuntimeProps) {
  const { kids } = useKids(props);
  const immediate = isImmediateContext(props.nodeInfo);

  // Immediate mode evaluates this grader's match function in selectors, so
  // lazy engines (FormulaGrader's mathjs) must load up front — submit mode
  // readies lazily in the grading action instead. The state bump re-renders
  // so derived selectors re-run against the loaded engine.
  // useState-ok: transient engine-readiness bump; nothing to persist or log
  const [, setEngineReady] = useState(false);
  const ensureReady = props.loBlock.ensureReady;
  useEffect(() => {
    if (immediate && ensureReady) ensureReady().then(() => setEngineReady(true));
  }, [immediate, ensureReady]);

  if (!immediate) return <>{kids}</>;
  return (
    <div className="lo-grader lo-grader--immediate">
      {kids}
      <span className="lo-grader__status">
        {/* requiresGrader inference finds this grader (nearest parent) */}
        <Block props={props} tag="Correctness" id={`${props.id}_status`} />
      </span>
    </div>
  );
}
