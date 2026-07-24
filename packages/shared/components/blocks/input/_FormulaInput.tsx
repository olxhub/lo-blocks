// packages/shared/components/blocks/input/_FormulaInput.tsx
'use client';
import type { RuntimeProps } from '@/lib/types';

import React, { useRef, useMemo, useEffect } from 'react';
import katex from 'katex';
import { useInputField } from '@/lib/state';
import { useKids } from '@/lib/render';
import { DisplayAnswer } from '@/components/common/DisplayAnswer';
import { latexPreview } from '@/lib/grading/calc/index.js';

export default function FormulaInput(props: RuntimeProps) {
  const { fields, ...rest } = props;

  const [value, inputProps] = useInputField(props, fields.value, '');

  const { kids } = useKids(props);
  const previewRef = useRef<HTMLDivElement>(null);

  // Parse attribute lists
  const variables = rest.variables ? String(rest.variables).split(',').map(s => s.trim()).filter(Boolean) : [];
  const functions = rest.functions ? String(rest.functions).split(',').map(s => s.trim()).filter(Boolean) : [];
  const caseSensitive = rest.caseSensitive === 'true' || rest.caseSensitive === true;
  const size = rest.size ? parseInt(String(rest.size), 10) : 20;

  // Derive latex and error from value (no useState needed)
  const { latex, error } = useMemo(() => {
    const text = value as string;
    if (!text || !text.trim()) return { latex: '', error: '' };
    try {
      return { latex: latexPreview(text, { variables, functions, caseSensitive }), error: '' };
    } catch (err: any) {
      return { latex: '', error: err.message };
    }
  }, [value, variables.join(','), functions.join(','), caseSensitive]);

  // Render KaTeX into the preview div when latex changes
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    if (!latex) {
      el.textContent = '';
      return;
    }
    try {
      katex.render(latex, el, { throwOnError: false, displayMode: true });
    } catch {
      el.textContent = latex;
    }
  }, [latex]);

  return (
    <>
      {kids}
      <div className="formula-input">
        <div className="flex items-center gap-2">
          <input
            {...inputProps}
            type="text"
            size={size}
            placeholder={rest.placeholder as string || ''}
            className="border rounded px-2"
          />
          {rest.trailingText && (
            <span className="text-muted">{String(rest.trailingText)}</span>
          )}
        </div>
        <div
          ref={previewRef}
          className="formula-preview min-h-[1.5em] mt-1"
          aria-live="polite"
        />
        {error && (
          <div className="text-danger text-sm mt-1" role="alert">{error}</div>
        )}
      </div>
      <DisplayAnswer props={props} />
    </>
  );
}
