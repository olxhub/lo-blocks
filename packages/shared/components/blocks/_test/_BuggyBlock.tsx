// packages/shared/components/blocks/_test/_BuggyBlock.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';
import type { AppError } from '@/lib/types/errors';
import React from 'react';

/**
 * Internal test block. Deliberately fails so we can exercise — and, in the
 * test suite, PROVE we detect — the platform's error pipeline end to end
 * (parse errors, render errors, ErrorBoundary, DisplayError, the render-error
 * ErrorNode). The parse-time behavior lives in BuggyBlock.ts; the
 * BuggyBlock*.olx fixtures pin one failure mode each.
 *
 *   throws="render"  → throw during React render
 *                      (real app: caught by RenderOLX's ErrorBoundary →
 *                       DisplayError + render-error ErrorNode)
 *   kind="native"    → throw new Error(...)             (well-formed Error)
 *   kind="apperror"  → throw an AppError-shaped object  (no native stack)
 *   kind="undefined" → call an undefined member         (raw TypeError)
 */
export function _BuggyBlock(props: RuntimeProps) {
  const { throws = 'render', kind = 'native', message } = props;
  const msg = typeof message === 'string' && message
    ? message
    : 'BuggyBlock: deliberate render-time failure';

  if (throws === 'render') {
    if (kind === 'undefined') {
      // Raw TypeError with no author-friendly message — exercises toAppError's
      // message/stack extraction on a non-AppError throw.
      (undefined as any).renderBoom();
    }
    if (kind === 'apperror') {
      // AppError-shaped throw (not a native Error): has message, no native stack.
      // Typed so the canonical shape is enforced, not a stray object literal.
      const appError: AppError = { title: 'BuggyBlock', message: msg, technical: { kind, synthetic: true } };
      throw appError;
    }
    throw new Error(msg);
  }

  return (
    <div className="p-4 border border-dashed border-warning rounded text-sm">
      <strong>BuggyBlock</strong>{' '}
      <span className="text-muted">
        (throws={String(throws)}, kind={String(kind)}) — no render-time failure.
      </span>
    </div>
  );
}
