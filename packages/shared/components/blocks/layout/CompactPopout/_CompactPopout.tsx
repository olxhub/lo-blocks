// packages/shared/components/blocks/layout/CompactPopout/_CompactPopout.tsx
//
// Overlay block that auto-expands on first render and collapses to a
// compact placeholder button.  Useful for large content (PDFs, detailed
// activities) that doesn't make sense inline — the user sees it full-screen
// first, then gets a re-openable placeholder.
//
// Usage:
//   <CompactPopout label="View the research paper" mode="fullscreen">
//     <PDFViewer src="paper.pdf" />
//   </CompactPopout>
//
// Or via chatpeg embed metadata:
//   ::paper_pdf [display=fullscreen label="View the research paper"]
//   ::activity  [display=target:sidebar]
//
// Modes:
//   fullscreen — Fullscreen API overlay, auto-opens on first render
//   window     — Fixed overlay, auto-opens on first render
//   target     — Repoints a target component (e.g. UseHistory sidebar),
//                auto-repoints on first render, placeholder stays in chat
'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import { useFieldState, updateField } from '@/lib/state';
import { fieldByName } from '@/lib/state/fields';
import { refToReduxKey } from '@/lib/blocks/idResolver';
import { useKids } from '@/lib/render';
import type { RuntimeProps, OlxReference, ReduxStateKey } from '@/lib/types';
import { fields } from './CompactPopout';

export default function _CompactPopout(props: RuntimeProps) {
  const { kids } = useKids(props);

  const mode = (props.mode ?? 'window') as 'fullscreen' | 'window' | 'target';
  const label = (props.label as string) ?? 'View expanded content';

  // Target mode never auto-expands the overlay (it repoints instead)
  const [expanded, setExpanded] = useFieldState(props, fields.expanded, mode !== 'target');

  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  /* ── Target mode: repoint a component ─────────────────────────── */

  const targetId = props.target as ReduxStateKey | undefined;
  const targetContent = props.targetContent as ReduxStateKey | undefined;

  const repoint = useCallback(() => {
    if (!targetId || !targetContent) return;
    const valueField = fieldByName('value');
    if (!valueField) return;
    updateField(props, valueField, targetContent, {
      reduxKey: refToReduxKey({ ...props, id: targetId as unknown as OlxReference }),
    });
  }, [props, targetId, targetContent]);

  // Auto-repoint on mount (like auto-expand for fullscreen/window).
  // Attributes are fixed per instance so capturing initial values is safe.
  useEffect(() => {
    if (mode === 'target') repoint();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fullscreen/window: overlay expand/collapse ───────────────── */

  const collapse = useCallback(() => {
    if (document.fullscreenElement === overlayRef.current) {
      document.exitFullscreen().catch(() => {});
    }
    setExpanded(false);
  }, [setExpanded]);

  const expand = useCallback(() => {
    setExpanded(true);
    if (mode === 'fullscreen') {
      setTimeout(() => {
        overlayRef.current?.requestFullscreen?.().catch((e) => {
          console.warn('[CompactPopout] Fullscreen request denied:', e.message);
        });
      }, 0);
    }
  }, [mode, setExpanded]);

  // Request fullscreen on initial auto-expand.
  // Empty deps: intentionally runs once on mount only — we want the
  // initial auto-expand, not re-requests on every state change.
  useEffect(() => {
    if (expanded && mode === 'fullscreen') {
      setTimeout(() => {
        overlayRef.current?.requestFullscreen?.().catch((e) => {
          console.warn('[CompactPopout] Initial fullscreen request denied:', e.message);
        });
      }, 0);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus close button when expanded
  useEffect(() => {
    if (expanded) {
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
  }, [expanded]);

  // Escape key dismissal
  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); collapse(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expanded, collapse]);

  // Handle fullscreenchange (user may exit via browser UI)
  useEffect(() => {
    if (!expanded || mode !== 'fullscreen') return;
    const handleChange = () => { if (!document.fullscreenElement) setExpanded(false); };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [expanded, mode, setExpanded]);

  /* ── Collapsed / target placeholder ───────────────────────────── */

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={mode === 'target' ? repoint : expand}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '12px 16px',
          background: 'var(--lo-bg-surface)',
          border: '1px solid var(--lo-border)',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
          color: 'var(--lo-text)',
          textAlign: 'left',
        }}
      >
        <Maximize2 size={16} style={{ flexShrink: 0, opacity: 0.6 }} />
        {label}
      </button>
    );
  }

  /* ── Expanded overlay (fullscreen/window only) ────────────────── */

  const overlay = (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--lo-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '8px 12px',
        borderBottom: '1px solid var(--lo-border)',
        flexShrink: 0,
      }}>
        <button
          type="button"
          ref={closeButtonRef}
          onClick={collapse}
          aria-label="Close expanded view"
          style={{
            background: 'none',
            border: '1px solid var(--lo-border)',
            borderRadius: 4,
            padding: '4px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 14,
            color: 'var(--lo-text)',
          }}
        >
          <X size={16} /> Close
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {kids}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
