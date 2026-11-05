// packages/shared/components/blocks/input/Done/_Done.tsx
'use client';

import React, { useId } from 'react';
import { useFieldState } from '@/lib/state';
import type { RuntimeProps } from '@/lib/types';
import './Done.css';

export default function Done(props: RuntimeProps) {
  const { align = 'left', label = 'Mark as complete', fields } = props;
  const [done, setDone] = useFieldState(props, fields.value, false);
  const inputId = useId();

  return (
    <div className={`done-control done-control-${align}`}>
      <span className="done-switch">
        <input
          id={inputId}
          type="checkbox"
          className="done-switch-input"
          checked={Boolean(done)}
          onChange={event => setDone(event.currentTarget.checked)}
        />
        <label className="done-switch-label" htmlFor={inputId}>
          <span className="done-sr-only">{label}</span>
          <span className="done-switch-track" aria-hidden="true">
            <span className="done-switch-state done-switch-unmark">Unmark</span>
            <span className="done-switch-state done-switch-mark">{label}</span>
          </span>
          <span className="done-switch-thumb" aria-hidden="true">{done ? '✓' : ''}</span>
        </label>
      </span>
    </div>
  );
}
