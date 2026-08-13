// packages/shared/components/blocks/action/_ActionButton.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { executeNodeActions } from '@/lib/blocks';
import { useKids } from '@/lib/player/client/render';
import {
  parse,
  extractStructuredRefs,
  useReferences,
  evaluate,
  createContext,
  EMPTY_REFS
} from '@/lib/stateLanguage';
import { useSubmitLocked, willFreeze } from '@/lib/player/submitLock';

const DEFAULT_CONFIRM =
  'Once you submit, your answers are locked. You will not be able to change them '
  + 'or check them again. You can still print or save a PDF afterwards.';

/** The dialog renders through a portal, so it sits OUTSIDE .lo-tag-actionbutton
 *  and inherits none of the block's button styling — which is wanted here (a
 *  pair of full-size primary buttons would read as the page's own controls),
 *  but means these two need their own. */
const btn = (primary: boolean): React.CSSProperties => ({
  padding: 'var(--lo-space-sm, 8px) var(--lo-space-lg, 16px)',
  borderRadius: 'var(--lo-radius-md, 6px)',
  border: `1px solid var(--lo-border, #ccc)`,
  background: primary ? 'var(--lo-primary, #2563eb)' : 'transparent',
  color: primary ? 'var(--lo-text-inverse, #fff)' : 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  minHeight: '40px',
});

/**
 * The point of no return, made explicit.
 *
 * Modal because the choice cannot be deferred: the action behind it is
 * irreversible from the learner's side, and a dismissible banner would let a
 * misclick through. Cancel is the DEFAULT — it takes the initial focus and it
 * is what Escape, the backdrop, and doing nothing all resolve to — because the
 * cost of the two mistakes is not symmetric. Submitting by accident ends the
 * assignment; cancelling by accident costs one more click.
 */
function ConfirmFreeze({ message, confirmLabel, onConfirm, onCancel }: {
  message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={onCancel}
      // print:hidden as a belt-and-braces guard. The dialog is already gone by
      // the time PrintAction runs — the freeze action is awaited first, which
      // lets React commit the unmount — but that ordering is a property of how
      // the button happens to be authored, and a confirmation dialog rendered
      // across a student's submitted PDF is not a failure worth risking on it.
      className="print:hidden"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--lo-space-lg, 16px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lo-confirm-freeze-title"
        // Clicks inside must not reach the backdrop's cancel handler.
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--lo-bg, #fff)',
          color: 'var(--lo-text, inherit)',
          border: '1px solid var(--lo-border, #ccc)',
          borderRadius: 'var(--lo-radius-md, 6px)',
          boxShadow: 'var(--lo-shadow-md, 0 4px 16px rgba(0,0,0,0.25))',
          maxWidth: '32rem', width: '100%',
          padding: 'var(--lo-space-xl, 24px)',
        }}
      >
        <h2 id="lo-confirm-freeze-title" style={{ marginTop: 0, fontSize: '1.1rem' }}>
          Submit and lock your answers?
        </h2>
        <p style={{ lineHeight: 1.5 }}>{message}</p>
        <div style={{
          display: 'flex', gap: 'var(--lo-space-md, 12px)',
          justifyContent: 'flex-end', marginTop: 'var(--lo-space-lg, 16px)',
        }}>
          <button type="button" ref={cancelRef} onClick={onCancel} style={btn(false)}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} style={btn(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ActionButton(props: RuntimeProps) {
  const { label, dependsOn, disabled: disabledAttr, ignoreSubmitLock, confirm } = props;

  // Parse expression and extract refs once
  const { ast, refs } = useMemo(() => {
    if (!dependsOn) return { ast: null, refs: EMPTY_REFS };
    try {
      const ast = parse(dependsOn);
      const refs = extractStructuredRefs(dependsOn);
      return { ast, refs };
    } catch (e) {
      console.warn('[ActionButton] Failed to parse dependsOn:', dependsOn, e);
      return { ast: null, refs: EMPTY_REFS };
    }
  }, [dependsOn]);

  // Subscribe to all referenced values (stable hook call)
  const resolved = useReferences(props, refs);

  // Evaluate condition
  const isSatisfied = useMemo(() => {
    if (!ast) return true;
    try {
      const context = createContext(resolved);
      return Boolean(evaluate(ast, context));
    } catch (e) {
      console.warn('[ActionButton] Failed to evaluate dependsOn:', dependsOn, e);
      return false;
    }
  }, [ast, resolved, dependsOn]);

  // Once the activity is submitted its buttons stop working — otherwise a
  // student could re-run LLM feedback (and spend tokens) on a handout they have
  // already handed in. The submit button itself opts out: it fires the freeze,
  // and if it disabled itself, cancelling the print dialog would leave no way
  // to print the submission again.
  const activityLocked = useSubmitLocked(props);
  const submitLocked = activityLocked && ignoreSubmitLock !== 'true';

  // Disabled if: explicit attribute, OR dependsOn condition not satisfied,
  // OR the surrounding activity has been submitted
  const isDisabled = disabledAttr === 'true' || !isSatisfied || submitLocked;

  // useState-ok: whether a dialog is open right now is not learner state. In a
  // field it would persist, so a reload would reopen the dialog over work the
  // student never chose to submit, and every open/close would land in the event
  // log as if it meant something.
  const [confirming, setConfirming] = useState(false);

  const { kids } = useKids(props);

  const run = () => executeNodeActions(props);

  // Warn only when there is something to warn ABOUT. Once the activity is
  // already locked this button is no longer a submit button in any meaningful
  // sense — it survives the lock precisely so a student can print their
  // submission again — and asking "are you sure? this will lock your answers"
  // about work that is already locked is both false and a good way to teach
  // students that the dialog is noise to be clicked through.
  //
  // Asked at CLICK time, not during render: the dynamic DOM is built as
  // children mount, so a button interrogating its own descendants while it
  // renders sees none of them and concludes it freezes nothing — which is
  // exactly the failure mode that skips the dialog and submits on the first
  // press. By click time the tree is complete, and it is the same moment
  // executeNodeActions resolves the actions it will run.
  const onClick = () =>
    (!activityLocked && willFreeze(props) ? setConfirming(true) : run());

  return (
    <>
      <button onClick={onClick} disabled={isDisabled}>
        {label}
        {kids}
      </button>
      {confirming && (
        <ConfirmFreeze
          message={typeof confirm === 'string' && confirm ? confirm : DEFAULT_CONFIRM}
          confirmLabel="Submit and lock"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); run(); }}
        />
      )}
    </>
  );
}

export default ActionButton;
